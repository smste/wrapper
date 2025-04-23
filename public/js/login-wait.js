// public/js/login-wait.js

document.addEventListener('DOMContentLoaded', () => {
    const statusMessageEl = document.getElementById('status-message');
    const spinnerEl = document.getElementById('spinner');
    let loginData;
    let socket = null; // Keep socket reference

    function updateStatus(message, hideSpinner = false) {
        if (statusMessageEl) statusMessageEl.textContent = message;
        if (hideSpinner && spinnerEl) spinnerEl.style.display = 'none';
    }

    try {
        const loginDataScript = document.getElementById('loginData');
        loginData = JSON.parse(loginDataScript.textContent);
    } catch (e) {
        console.error("Could not parse login data from page.");
        updateStatus("Error: Missing login request data.", true);
        return; // Stop if data missing
    }

    const loginRequestId = loginData?.loginRequestId;

    if (!loginRequestId) {
        console.error("Login Request ID not found on page.");
        updateStatus("Error: Login Request ID missing.", true);
        return; // Stop if ID missing
    }

    // --- Connect WebSocket ---
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    console.log(`Attempting WebSocket connection to: ${wsUrl}`);
    updateStatus("Connecting to confirmation service...");

    try {
        socket = new WebSocket(wsUrl);
    } catch (error) {
        console.error('WebSocket connection failed:', error);
        updateStatus('Error connecting to confirmation service.', true);
        return;
    }


    socket.addEventListener('open', () => {
        console.log('WebSocket Connected!');
        updateStatus('Connected. Waiting for approval via Discord DM...');
        // Register this client with its loginRequestId
        const registrationMsg = JSON.stringify({
            type: 'register',
            loginRequestId: loginRequestId
        });
        console.log('Sending registration:', registrationMsg);
        socket.send(registrationMsg);
    });

    socket.addEventListener('message', async (event) => { // Make handler async
        console.log('WebSocket Message received:', event.data);
        try {
            const message = JSON.parse(event.data);

            if (message.type === 'loginApproved' && message.payload?.ott) {
                // --- Login Approved - Got OTT ---
                const oneTimeToken = message.payload.ott;
                console.log('Login approved via Discord, received OTT. Finalizing session...');
                updateStatus('Login Approved! Finalizing session...', false); // Keep spinner
                socket.close(); // Close WS connection, no longer needed

                try {
                    // --- Make POST request to finalize session ---
                    const finalizeResponse = await fetch('/auth/finalize-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // Add CSRF token header if using csurf middleware
                        },
                        body: JSON.stringify({ ott: oneTimeToken })
                    });

                    const finalizeData = await finalizeResponse.json();

                    if (finalizeResponse.ok && finalizeData.success) {
                        // --- Session Finalized - Redirect ---
                        console.log('Session finalized successfully. Redirecting...');
                        updateStatus('Success! Redirecting to your dashboard...', true);
                        window.location.href = '/dashboard'; // Redirect!
                    } else {
                        // API rejected the OTT or failed to create session
                        console.error('Failed to finalize session:', finalizeData);
                        updateStatus(`Error: ${finalizeData.message || 'Could not finalize login session.'}`, true);
                    }
                } catch (fetchError) {
                    console.error('Error during finalize POST request:', fetchError);
                    updateStatus('Error communicating with server to finalize login.', true);
                }

            } else if (message.type === 'loginDenied') {
                 console.log('Login denied via Discord.');
                 updateStatus('Login was denied via Discord. Please try logging in again if this was a mistake.', true);
                 socket.close();
            } else if (message.type === 'registered') {
                console.log("WebSocket registration confirmed by server.");
                // No status change needed here, keep waiting message
            }
        } catch (e) {
            console.error('Error processing WebSocket message:', e);
            updateStatus('Received an unexpected message from server.', true);
        }
    }); // End message listener

    socket.addEventListener('close', (event) => {
        console.log('WebSocket Closed:', event.code, event.reason);
        // Update status only if login wasn't already approved/denied
        if (!statusMessageEl.textContent.includes('Approved') && !statusMessageEl.textContent.includes('Denied') && !statusMessageEl.textContent.includes('Error')) {
             updateStatus('Connection closed. Please try logging in again.', true);
        }
    });

    socket.addEventListener('error', (event) => {
        console.error('WebSocket Error:', event);
         updateStatus('Connection error. Please refresh and try logging in again.', true);
    });

}); // End DOMContentLoaded