// Global state for seats
let selectedSeats = [];
let busDetailObj = null;
let occupiedSeats = [];
let busId = "";
let routeFrom = "";
let routeTo = "";
let travelDate = "";

// Initialize seat selection page
document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    busId = params.get("busId");
    routeFrom = params.get("from");
    routeTo = params.get("to");
    travelDate = params.get("date");

    if (!busId) {
        showToast("Invalid route settings. Returning to dashboard...", "error");
        setTimeout(() => window.location.href = "home.html", 1500);
        return;
    }

    // Load Admin status
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const adminNav = document.getElementById("admin-nav-item");
    if (adminNav && isAdmin) {
        adminNav.style.display = "block";
    }

    // Fetch Bus details
    const buses = await getBuses();
    busDetailObj = buses.find(b => b.id === busId || b.busId === busId);

    if (!busDetailObj) {
        showToast("Bus operator not found.", "error");
        setTimeout(() => window.location.href = "home.html", 1500);
        return;
    }

    // Normalize keys just in case, ensuring safe defaults on legacy objects
    busDetailObj.id = busDetailObj.busId || busDetailObj.id || busId;
    busDetailObj.name = busDetailObj.busName || busDetailObj.name || "Comfort Travels";
    busDetailObj.type = busDetailObj.busType || busDetailObj.type || "Non-AC Seater";
    busDetailObj.number = busDetailObj.busNumber || busDetailObj.number || "MH 12 AB 9999";
    busDetailObj.price = busDetailObj.price !== undefined ? parseFloat(busDetailObj.price) : 500;

    // Fallbacks if not passed in query URL params
    if (!routeFrom) routeFrom = busDetailObj.fromCity || "Departure Stop";
    if (!routeTo) routeTo = busDetailObj.toCity || "Arrival Stop";
    if (!travelDate) {
        travelDate = new Date().toISOString().split("T")[0]; // default to today
    }

    // Populate UI
    document.getElementById("bannerBusName").innerText = busDetailObj.name;
    document.getElementById("bannerBusType").innerText = busDetailObj.type;
    document.getElementById("bannerRoute").innerHTML = `${routeFrom} &rarr; ${routeTo}`;
    document.getElementById("bannerDate").innerText = travelDate;

    document.getElementById("sideRoute").innerHTML = `${routeFrom} &rarr; ${routeTo}`;
    document.getElementById("sideDate").innerText = formatDateFriendly(travelDate);
    document.getElementById("sideBusInfo").innerText = `${busDetailObj.name} | ${busDetailObj.type}`;

    // Query database/mock for occupied seats
    occupiedSeats = await getOccupiedSeats(busId, travelDate);

    // Render layout
    renderSeatChartLayout();
});

// Format Date helper
function formatDateFriendly(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Render dynamic elements
function renderSeatChartLayout() {
    const loader = document.getElementById("seatLayoutLoader");
    const area = document.getElementById("seatLayoutArea");
    if (!loader || !area) return;

    loader.style.display = "none";
    area.style.display = "block";
    area.innerHTML = "";

    const isSleeper = busDetailObj.type.toLowerCase().includes("sleeper");

    if (isSleeper) {
        // Render Dual Deck sleeper layout
        area.innerHTML = `
      <div class="row g-4">
        <!-- Lower Deck -->
        <div class="col-md-6">
          <div class="deck-container">
            <div class="deck-title">Lower Deck</div>
            <div class="driver-cabin">
              <i class="bi bi-compass steering-wheel" title="Driver Wheel"></i>
            </div>
            <div class="deck-grid" id="lowerDeckGrid"></div>
          </div>
        </div>
        
        <!-- Upper Deck -->
        <div class="col-md-6">
          <div class="deck-container">
            <div class="deck-title">Upper Deck</div>
            <div class="driver-cabin opacity-0">
              <i class="bi bi-compass steering-wheel"></i>
            </div>
            <div class="deck-grid" id="upperDeckGrid"></div>
          </div>
        </div>
      </div>
    `;

        // Lower Deck Rows: A (A1-A10) and B (B1-B10)
        renderSleeperRows("lowerDeckGrid", ["A", "B"]);
        // Upper Deck Rows: C (C1-C10) and D (D1-D10)
        renderSleeperRows("upperDeckGrid", ["C", "D"]);

    } else {
        // Render standard single deck seater layout
        area.innerHTML = `
      <div class="deck-container mx-auto" style="max-width: 500px;">
        <div class="deck-title">Seating Cabin</div>
        <div class="driver-cabin">
          <span class="badge bg-secondary me-3 small"><i class="bi bi-person-fill"></i> Driver Cabin</span>
          <i class="bi bi-compass steering-wheel" title="Steering Icon"></i>
        </div>
        <div class="deck-grid" id="seaterDeckGrid"></div>
      </div>
    `;

        renderSeaterGrid("seaterDeckGrid");
    }
}

// Helpers for sleepers
function renderSleeperRows(containerId, rowsArray) {
    const container = document.getElementById(containerId);
    if (!container) return;

    rowsArray.forEach(rowLetter => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "seat-row flex-wrap justify-content-center";

        for (let c = 1; c <= 10; c++) {
            const seatNo = `${rowLetter}${c}`;
            const isBooked = occupiedSeats.includes(seatNo);

            const seatEl = document.createElement("div");
            seatEl.className = `seat-cell sleeper ${isBooked ? "booked" : "available"}`;
            seatEl.innerText = seatNo;

            if (!isBooked) {
                seatEl.addEventListener("click", () => toggleSeatSelection(seatEl, seatNo));
            }
            rowDiv.appendChild(seatEl);

            // Add a middle corridor gap after Row A / Row C (vertical gap simulation in sleeper deck)
        }
        container.appendChild(rowDiv);
    });
}

// Helpers for standard buses
function renderSeaterGrid(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // We have rows A, B, Corridor Gap, C, D
    const rowMapping = [
        { label: "A", class: "" },
        { label: "B", class: "" },
        { label: "GAP", class: "seat-gap" },
        { label: "C", class: "" },
        { label: "D", class: "" }
    ];

    rowMapping.forEach(rowInfo => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "seat-row justify-content-center";

        if (rowInfo.label === "GAP") {
            rowDiv.className = "seat-row seat-gap";
            container.appendChild(rowDiv);
            return;
        }

        for (let c = 1; c <= 10; c++) {
            const seatNo = `${rowInfo.label}${c}`;
            const isBooked = occupiedSeats.includes(seatNo);

            const seatEl = document.createElement("div");
            seatEl.className = `seat-cell seater ${isBooked ? "booked" : "available"}`;
            seatEl.innerText = seatNo;

            if (!isBooked) {
                seatEl.addEventListener("click", () => toggleSeatSelection(seatEl, seatNo));
            }
            rowDiv.appendChild(seatEl);
        }
        container.appendChild(rowDiv);
    });
}

// Seat Click select toggler
function toggleSeatSelection(element, seatId) {
    if (selectedSeats.includes(seatId)) {
        // Remove selection
        selectedSeats = selectedSeats.filter(id => id !== seatId);
        element.classList.replace("selected", "available");
    } else {
        // Check maximum booking seats safeguard limit (6 seats standard)
        if (selectedSeats.length >= 6) {
            showToast("You can choose a maximum of 6 seats at once.", "warning");
            return;
        }
        // Add selection
        selectedSeats.push(seatId);
        element.classList.replace("available", "selected");
    }

    updateSelectionSummary();
}

// Summary Calculation updates
function updateSelectionSummary() {
    const label = document.getElementById("selectedSeatsLabel");
    const continueBtn = document.getElementById("btnContinue");

    if (selectedSeats.length === 0) {
        label.innerText = "None";
        continueBtn.disabled = true;

        document.getElementById("seatPriceBase").innerText = "₹0";
        document.getElementById("seatPriceTaxes").innerText = "₹0";
        document.getElementById("totalAmount").innerText = "₹0";
        return;
    }

    continueBtn.disabled = false;
    label.innerText = selectedSeats.sort(sortSeatNumbers).join(", ");

    const basePrice = busDetailObj.price * selectedSeats.length;
    const taxes = Math.round(basePrice * 0.05); // 5% simulated GST/Tolls
    const total = basePrice + taxes;

    document.getElementById("seatPriceBase").innerText = `₹${basePrice}`;
    document.getElementById("seatPriceTaxes").innerText = `₹${taxes}`;
    document.getElementById("totalAmount").innerText = `₹${total}`;
}

// Sort custom seat coordinates A1, A2, B10 cleanly
function sortSeatNumbers(a, b) {
    const rowA = a.charAt(0);
    const rowB = b.charAt(0);
    const numA = parseInt(a.slice(1));
    const numB = parseInt(b.slice(1));

    if (rowA !== rowB) return rowA.LocaleCompare(rowB);
    return numA - numB;
}

// Route to checkout form details Page
function handleContinueBooking() {
    const basePrice = busDetailObj.price * selectedSeats.length;
    const taxes = Math.round(basePrice * 0.05);
    const total = basePrice + taxes;

    // Storing state in sessionStorage to securely pass parameters to the details collect fields page
    const checkoutPayload = {
        busId,
        busName: busDetailObj.name,
        busType: busDetailObj.type,
        fromCity: routeFrom,
        toCity: routeTo,
        travelDate,
        selectedSeats,
        baseFare: basePrice,
        taxesFees: taxes,
        totalPayable: total
    };

    sessionStorage.setItem("activeBookingCheckout", JSON.stringify(checkoutPayload));
    window.location.href = `booking.html`;
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}