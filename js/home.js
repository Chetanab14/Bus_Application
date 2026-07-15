// List of Cities for Autocomplete Suggestions
const CITIES = [
    "Delhi", "Mumbai", "Bangalore", "Pune", "Hyderabad",
    "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Goa",
    "Noida", "Gurgaon", "Chandigarh", "Visakhapatnam"
];

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    // Set default date to today
    const dateInput = document.getElementById("travelDate");
    if (dateInput) {
        const today = new Date().toISOString().split("T")[0];
        dateInput.min = today;
        dateInput.value = today;
    }

    // Welcome user
    const userName = localStorage.getItem("userName") || "Passenger";
    // Dynamically update greeting if placeholder exists
    const welcomeText = document.getElementById("welcomeGreeting");
    if (welcomeText) {
        welcomeText.innerText = `Welcome, ${userName}!`;
    }

    // Check if admin to show admin nav link
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const adminNav = document.getElementById("admin-nav-item");
    if (adminNav && isAdmin) {
        adminNav.style.display = "block";
    }

    // Bind Autocomplete events
    setupAutocomplete("fromCity", "fromSuggestions");
    setupAutocomplete("toCity", "toSuggestions");

    // Load all available buses (DynamoDB call simulation)
    loadAvailableBuses();
});

// Setup Autocompletion Box
function setupAutocomplete(inputId, suggestionBoxId) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(suggestionBoxId);
    if (!input || !box) return;

    // Show suggestions on input
    input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        box.innerHTML = "";

        if (!query) {
            box.style.display = "none";
            return;
        }

        const matches = CITIES.filter(city => city.toLowerCase().includes(query));
        if (matches.length === 0) {
            box.style.display = "none";
            return;
        }

        matches.forEach(city => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.innerHTML = `<i class="bi bi-geo-alt-fill text-danger small"></i> <span>${city}</span>`;
            div.addEventListener("click", () => {
                input.value = city;
                box.style.display = "none";
            });
            box.appendChild(div);
        });
        box.style.display = "block";
    });

    // Close suggestion boxes on clicking outside
    document.addEventListener("click", (e) => {
        if (e.target !== input && e.target !== box && !box.contains(e.target)) {
            box.style.display = "none";
        }
    });
}

// Swap From & To cities
function swapCities() {
    const from = document.getElementById("fromCity");
    const to = document.getElementById("toCity");
    if (from && to) {
        const temp = from.value;
        from.value = to.value;
        to.value = temp;
    }
}

// Fill quick search and scroll up
function fillSearchQuick(from, to) {
    const fromInput = document.getElementById("fromCity");
    const toInput = document.getElementById("toCity");
    if (fromInput && toInput) {
        fromInput.value = from;
        toInput.value = to;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(`Quick Route Selected: ${from} to ${to}`, "info");
    }
}

// Handle Search Event
function handleBusSearch(event) {
    event.preventDefault();

    const fromCity = document.getElementById("fromCity").value.trim();
    const toCity = document.getElementById("toCity").value.trim();
    const travelDate = document.getElementById("travelDate").value;

    if (fromCity.toLowerCase() === toCity.toLowerCase()) {
        showToast("From and To cities cannot be identical.", "warning");
        return;
    }

    showLoader("Searching active buses...");

    // Go to search.html with params
    setTimeout(() => {
        hideLoader();
        window.location.href = `search.html?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${encodeURIComponent(travelDate)}`;
    }, 1000);
}

// Load all buses to display in "Available Operators" section on load
async function loadAvailableBuses() {
    const container = document.getElementById("generalBusContainer");
    if (!container) return;

    try {
        const buses = await getBuses();

        // Clear skeletons
        container.innerHTML = "";

        if (!buses || buses.length === 0) {
            container.innerHTML = `
        <div class="col-12 text-center py-4">
          <i class="bi bi-info-circle fs-2 text-muted"></i>
          <p class="text-muted mt-2">No active bus operators registered at this time.</p>
        </div>
      `;
            return;
        }

        // Display first 6 buses as cards
        buses.slice(0, 6).forEach(bus => {
            const col = document.createElement("div");
            col.className = "col-md-4";
            col.innerHTML = `
        <div class="card card-custom p-4 h-100 d-flex flex-column justify-content-between">
          <div>
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h5 class="fw-bold mb-0">${bus.name}</h5>
              <span class="rating-badge"><i class="bi bi-star-fill"></i> ${bus.rating.toFixed(1)}</span>
            </div>
            <p class="text-muted small mb-3"><i class="bi bi-hash"></i> ${bus.number} | ${bus.type}</p>
            <div class="border-top pt-2 mt-2">
              <div class="d-flex justify-content-between mb-1">
                <span class="small text-muted">Route:</span>
                <span class="small fw-semibold text-dark">${bus.fromCity} &rarr; ${bus.toCity}</span>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span class="small text-muted">Departure:</span>
                <span class="small fw-semibold text-dark">${bus.departure}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span class="small text-muted">Price:</span>
                <span class="small fw-bold text-danger">₹${bus.price}</span>
              </div>
            </div>
          </div>
          <button class="btn btn-outline-danger btn-sm w-100 mt-4" onclick="selectRouteQuick('${bus.fromCity}', '${bus.toCity}')">Book Route</button>
        </div>
      `;
            container.appendChild(col);
        });
    } catch (error) {
        console.error("Failed to load available buses:", error);
        container.innerHTML = `<div class="col-12 text-center text-muted"><p>Error connecting to operators database.</p></div>`;
    }
}

function selectRouteQuick(from, to) {
    const fromInput = document.getElementById("fromCity");
    const toInput = document.getElementById("toCity");
    if (fromInput && toInput) {
        fromInput.value = from;
        toInput.value = to;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(`Operator selected. Confirm Date of Journey and click Search!`, "warning");
    }
}

// Logout session cleanup
function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}