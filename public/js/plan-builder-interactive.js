// public/js/plan-builder-interactive.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("Plan Builder JS Loaded");

    // --- State ---
    // Using simple array. For complex state, consider a mini-library or framework approach.
    let currentPlanLegs = []; // Holds { flightReference, segmentFlightCode, departureIata, arrivalIata, departureAirport, arrivalAirport, arrivalTimeISO }

    // Cache for fetched legs to avoid repeated API calls when opening modal
    let availableLegsCache = null; // null initially, array once fetched
    let isLoadingLegs = false;

    // --- Elements ---
    const selectedLegsListEl = document.getElementById('selected-legs-list');
    const noLegsMessageEl = document.getElementById('no-legs-message');
    const createPlanFormEl = document.getElementById('create-plan-form');
    const planNameInputEl = document.getElementById('planName');
    const formMessageEl = document.getElementById('form-message'); // For save success/error
    const planValidationMessageEl = document.getElementById('plan-validation-message'); // For leg connection warnings
    const addLegButtonEl = document.getElementById('add-leg-button');
    const addLegModalEl = document.getElementById('addLegModal');
    const modalLoadingSpinnerEl = document.getElementById('modal-loading-spinner');
    const modalErrorMessageEl = document.getElementById('modal-error-message');
    const modalLegsListEl = document.getElementById('modal-legs-list');
    const savePlanButton = document.getElementById('save-plan-button');
    const savePlanButtonSpinner = savePlanButton?.querySelector('.spinner-border');


    // --- Bootstrap Modal Instance ---
    // Ensure modal element exists before creating instance
    const addLegModalInstance = addLegModalEl ? new bootstrap.Modal(addLegModalEl) : null;

    // --- Functions ---

    // Fetch available legs from API (only if not already cached)
    function loadAvailableLegsFromPage() {
        if (availableLegsCache !== null) return; // Already loaded

        try {
            if (!availableLegsDataScript) {
                throw new Error('Available legs data script tag not found.');
            }
            availableLegsCache = JSON.parse(availableLegsDataScript.textContent || '[]');
            console.log(`Loaded ${availableLegsCache.length} available legs from page data.`);
            // Immediately populate modal content if needed (though it happens on show)
            // populateModal(availableLegsCache);
        } catch (error) {
            console.error('Error loading/parsing available legs from page data:', error);
            availableLegsCache = []; // Set to empty on error
            // Optionally show an error message on the main page
            if(formMessageEl) setMessage('Could not load available flight data.', 'danger', false);
        }
    }

    // Set the display state of the modal (loading, error, display list)
    function setModalState(state, message = '') {
        if (!modalLoadingSpinnerEl || !modalErrorMessageEl || !modalLegsListEl) return; // Elements must exist
        modalLoadingSpinnerEl.classList.toggle('d-none', state !== 'loading');
        modalErrorMessageEl.classList.toggle('d-none', state !== 'error');
        modalLegsListEl.classList.toggle('d-none', state !== 'display');

        if (state === 'error') {
            modalErrorMessageEl.textContent = message;
            modalErrorMessageEl.classList.remove('d-none'); // Ensure error is visible
        }
    }

    // Populate the modal list with available legs fetched from API
    function populateModal(legs) {
        if (!modalLegsListEl) return;
        modalLegsListEl.innerHTML = ''; // Clear previous list

        if (!legs || legs.length === 0) {
             setModalState('error', 'No available flight legs found in the system.');
             return;
        }

        legs.forEach(leg => {
            // Check if this leg is already in the current plan
            const alreadyAdded = currentPlanLegs.some(planLeg =>
                 planLeg.flightReference === leg.flightReference &&
                 planLeg.segmentFlightCode === leg.segmentFlightCode
                 // Add more checks if needed (e.g., based on time if ref/code reused)
            );

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'list-group-item list-group-item-action select-leg-btn';
            button.disabled = alreadyAdded; // Disable if already added
            // Store ALL necessary leg data in data attributes
            button.dataset.flightRef = leg.flightReference;
            button.dataset.segmentCode = leg.segmentFlightCode;
            button.dataset.depIata = leg.departureIata;
            button.dataset.arrIata = leg.arrivalIata;
            // Store extra display info
            button.dataset.depAirport = leg.departureAirport || leg.departureIata; // Fallback
            button.dataset.arrAirport = leg.arrivalAirport || leg.arrivalIata; // Fallback
            button.dataset.arrTimeIso = leg.scheduledArrivalTimeISO;
            button.dataset.depTimeFormat = leg.departureTimeFormat; // Store departure time too

             // Format arrival time for display (using user's locale and assumed browser timezone initially)
             // More accurate would be using date-fns-tz here too if available client-side, or show UTC
             const arrivalTimeFormatted = new Date(leg.scheduledArrivalTimeISO).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

             button.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                     <h6 class="mb-1">
                          <span class="badge bg-secondary me-1">${leg.segmentFlightCode}</span>
                          ${leg.departureIata} &rarr; ${leg.arrivalIata} ${alreadyAdded ? '<span class="badge bg-success ms-2">Added</span>' : ''}
                     </h6>
                     <small class="text-muted">Acft: ${leg.aircraft || 'N/A'}</small>
                 </div>
                 <p class="mb-1 small">${leg.departureAirport || leg.departureIata} to ${leg.arrivalAirport || leg.arrivalIata}</p>
                 <small class="text-muted">Departs: ${leg.departureTimeFormat || 'N/A'} | Arrives: ${arrivalTimeFormatted}</small>
            `;
            modalLegsListEl.appendChild(button);
        });

        setModalState('display'); // Show the populated list
    }

    // Render the list of *selected* legs on the main plan-create page
    function renderSelectedLegs() {
        if (!selectedLegsListEl || !noLegsMessageEl || !planValidationMessageEl) return;

        selectedLegsListEl.innerHTML = ''; // Clear current list
        planValidationMessageEl.textContent = ''; // Clear validation message
        let connectionError = false;
        let previousLeg = null;

        if (currentPlanLegs.length === 0) {
            noLegsMessageEl.style.display = 'list-item';
        } else {
            noLegsMessageEl.style.display = 'none';
            currentPlanLegs.forEach((leg, index) => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                let validationWarning = '';

                // Basic connection validation
                if (index > 0 && previousLeg) {
                    if (previousLeg.arrivalIata !== leg.departureIata) {
                        validationWarning += `<small class="d-block text-danger fw-bold">⚠️ Airport Mismatch: Arrives ${previousLeg.arrivalIata}, Departs ${leg.departureIata}!</small>`;
                        connectionError = true;
                    }
                    // Basic time validation (needs improvement for accuracy across dates/timezones)
                    // Compare arrival time of previous leg with *departure time* of current leg
                    // We need departure time for current leg - let's assume it was stored or can be inferred
                    // This simple ISO comparison is often NOT enough without timezone handling.
                    // if (new Date(leg.departureTimeISO_placeholder) <= new Date(previousLeg.arrivalTimeISO)) {
                    //     validationWarning += `<small class="d-block text-warning fw-bold">⚠️ Timing Issue: Departs before previous leg arrives!</small>`;
                    // }
                }

                 const arrivalTimeFormatted = new Date(leg.arrivalTimeISO).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

                 li.innerHTML = `
                    <div>
                         <span class="badge bg-danger me-2">${leg.segmentFlightCode}</span>
                         <strong class="me-1">${leg.departureIata} &rarr; ${leg.arrivalIata}</strong> (${leg.arrivalAirport || 'N/A'})
                         <small class="text-muted d-block">
                             Ref: ${leg.flightReference} | Arrives: ${arrivalTimeFormatted}
                         </small>
                         ${validationWarning}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary remove-leg-btn" data-index="${index}" aria-label="Remove leg">&times;</button>
                `;
                selectedLegsListEl.appendChild(li);
                previousLeg = leg; // Store current leg for next comparison
            });

             if (connectionError) {
                 planValidationMessageEl.textContent = 'Warning: Check connections! Arrival airport of one leg should match the departure airport of the next.';
            }
        }
        addRemoveButtonListeners(); // Re-attach listeners after rendering
    }

    // Add event listeners to Remove buttons within the selected legs list
    function addRemoveButtonListeners() {
        const removeButtons = selectedLegsListEl?.querySelectorAll('.remove-leg-btn');
        removeButtons?.forEach(button => {
            button.removeEventListener('click', handleRemoveLegClick); // Prevent duplicates
            button.addEventListener('click', handleRemoveLegClick);
        });
    }

    // Handle removing a leg from the selected list
    function handleRemoveLegClick(event) {
        const button = event.target.closest('.remove-leg-btn'); // Ensure we get the button
        if (!button) return;

        const indexToRemove = parseInt(button.dataset.index, 10);
        if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < currentPlanLegs.length) {
             currentPlanLegs.splice(indexToRemove, 1); // Remove leg from array
             renderSelectedLegs(); // Re-render the list
             console.log("Leg removed. Current plan:", currentPlanLegs);
        } else {
             console.warn("Could not remove leg, invalid index:", button.dataset.index);
        }
    }


    // Handle selecting a leg from the modal
    function handleSelectLegClick(event) {
        const button = event.target.closest('.select-leg-btn');
        if (!button || button.disabled) { // Check if button exists and is not disabled
            return;
        }

        const legData = {
            flightReference: button.dataset.flightRef,
            segmentFlightCode: button.dataset.segmentCode,
            departureIata: button.dataset.depIata,
            arrivalIata: button.dataset.arrIata,
            departureAirport: button.dataset.depAirport,
            arrivalAirport: button.dataset.arrAirport,
            arrivalTimeISO: button.dataset.arrTimeIso,
            // Store departure time if available for better time validation later?
            // departureTimeFormat: button.dataset.depTimeFormat
        };

        currentPlanLegs.push(legData);
        renderSelectedLegs(); // Update the list on the main page
        addLegModalInstance?.hide(); // Hide the modal using the instance

        console.log('Leg selected:', legData);
    }

    // Handle submitting the create plan form
    async function handleCreatePlanSubmit(event) {
        event.preventDefault(); // Stop standard form submission
        setMessage('', 'info', false); // Clear previous messages
        if (!createPlanFormEl) return;

        // Use Bootstrap's built-in validation feedback
        if (!createPlanFormEl.checkValidity()) {
             event.stopPropagation();
             createPlanFormEl.classList.add('was-validated');
             setMessage('Please provide a valid plan name.', 'warning');
             return;
        }
        createPlanFormEl.classList.add('was-validated'); // Keep showing validation state

        const planName = planNameInputEl.value.trim();

        if (currentPlanLegs.length === 0) {
            setMessage('Please add at least one flight leg using the "+ Add Flight Leg" button.', 'warning');
            return;
        }

        // Prepare only essential leg data for API
        const apiLegs = currentPlanLegs.map(leg => ({
             flightReference: leg.flightReference,
             segmentFlightCode: leg.segmentFlightCode,
             departureIata: leg.departureIata,
             arrivalIata: leg.arrivalIata
             // Do NOT send display data like airport names or ISO times here
             // unless the API specifically requires them for plan creation
        }));

        const payload = {
            planName: planName,
            legs: apiLegs
            // Backend route gets robloxId from session
        };

        // Disable button and show spinner during save
        if (savePlanButton) savePlanButton.disabled = true;
        if (savePlanButtonSpinner) savePlanButtonSpinner.classList.remove('d-none');
        setMessage('Saving flight plan...', 'info', false);

        try {
            const response = await fetch('/plan/create-web', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json(); // Always try to parse JSON

            if (response.ok && result.success) {
                 setMessage(`Flight plan '${planName}' created successfully! (Ref: ${result.planReference || 'N/A'})`, 'success', false);
                 currentPlanLegs = []; // Clear current plan state
                 renderSelectedLegs(); // Update UI to show empty list
                 createPlanFormEl.reset(); // Clear form name
                 createPlanFormEl.classList.remove('was-validated');
            } else {
                 // Handle API error response
                 throw new Error(result.message || `Failed to save plan (Status: ${response.status})`);
            }

        } catch (error) {
            console.error('Error saving flight plan:', error);
            setMessage(`Error saving plan: ${error.message}`, 'danger', false);
        } finally {
             // Re-enable button and hide spinner
             if (savePlanButton) savePlanButton.disabled = false;
             if (savePlanButtonSpinner) savePlanButtonSpinner.classList.add('d-none');
        }
    }

    // Helper to display messages below the create form
    function setMessage(message, type = 'info', autoDismiss = true) {
         if (formMessageEl) {
             if (!message) {
                 formMessageEl.innerHTML = '';
                  return;
             }
             // Use Bootstrap alert structure
             formMessageEl.innerHTML = `
                 <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                     ${message}
                     <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                 </div>`;

             // Auto dismiss (optional) - relies on Bootstrap JS handling data-bs-dismiss
             // if (autoDismiss) { ... }
         }
     }


    // --- Event Listeners Setup ---

    // Listener for modal trigger button (only fetch when shown)
    // --- Event Listeners Setup ---

    // Listener for opening the modal - NOW populates from cached data
    addLegModalEl?.addEventListener('show.bs.modal', () => {
        if (availableLegsCache === null) {
             console.warn("Modal shown but available legs haven't been loaded from page yet.");
             setModalState('error', 'Loading flight data failed. Please refresh.');
             return;
        }
        console.log("Populating modal from pre-loaded data.");
        populateModal(availableLegsCache); // Populate using pre-loaded data
    });

    // Listener for clicking SELECT on a leg inside the modal (using event delegation)
    modalLegsListEl?.addEventListener('click', handleSelectLegClick);

    // Listener for submitting the main plan creation form
    createPlanFormEl?.addEventListener('submit', handleCreatePlanSubmit);

    loadAvailableLegsFromPage(); // Load data as soon as DOM is ready

    // Initial render if on the create page
    if (selectedLegsListEl && createPlanFormEl) {
         renderSelectedLegs(); // Render initially selected legs (likely none)
         console.log("Plan Builder Interactive: Initialized create plan page.");
    }

});