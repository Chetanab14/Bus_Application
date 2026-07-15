// Global search state
let allBuses = [];
let routeFrom = "";
let routeTo = "";
let travelDate = "";
let currentPriceMax = 2500;
let minRatingFilter = 0;
let activeSortType = 'price'; // Default sort

// Parse query params on load
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  routeFrom = params.get("from") || "";
  routeTo = params.get("to") || "";
  travelDate = params.get("date") || "";

  if (!routeFrom || !routeTo) {
    showToast("Invalid search parameters. Redirecting to home...", "warning");
    setTimeout(() => window.location.href = "home.html", 1500);
    return;
  }

  // Update navbar check for Admin
  const isAdmin = localStorage.getItem("isAdmin") === "true";
  const adminNav = document.getElementById("admin-nav-item");
  if (adminNav && isAdmin) {
    adminNav.style.display = "block";
  }

  // Set top ribbon labels
  document.getElementById("labelFrom").innerText = routeFrom;
  document.getElementById("labelTo").innerText = routeTo;
  document.getElementById("labelDate").innerText = formatDateFriendly(travelDate);

  // Setup event listeners for check filters
  document.querySelectorAll(".filter-checkbox, .filter-checkbox-time").forEach(c => {
    c.addEventListener("change", applyFiltersAndSort);
  });

  // Fetch match results
  fetchSearchResults();
});

// Format Date to Day, Month Date format
function formatDateFriendly(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Invoke API fetch
async function fetchSearchResults() {
  showLoader("Finding buses...");

  try {
    const results = await searchBuses(routeFrom, routeTo, travelDate);

    // Map the DynamoDB response keys to frontend bus card values with safe defaults.
    allBuses = (results || []).map(b => {
      const busType = b.busType || b.type || "Non-AC Seater";
      const departure = b.departureTime || b.departure || "12:00 PM";
      const arrival = b.arrivalTime || b.arrival || "04:00 PM";

      const totalSeatsVal = b.totalSeats !== undefined ? parseInt(b.totalSeats) : 40;
      const availableSeatsVal = b.availableSeats !== undefined ? parseInt(b.availableSeats) : totalSeatsVal;

      // Calculate duration dynamically if missing
      const durationVal = b.duration || calculateDuration(
        departure.includes(" ") ? convert12hTo24h(departure) : departure,
        arrival.includes(" ") ? convert12hTo24h(arrival) : arrival
      );

      return {
        id: b.busId || b.id || "bus_" + Math.floor(1000 + Math.random() * 9000),
        name: b.busName || b.name || "Comfort Travels",
        number: b.busNumber || b.number || "MH 12 AB 9999",
        type: busType,
        fromCity: b.fromCity || routeFrom,
        toCity: b.toCity || routeTo,
        departure: departure,
        arrival: arrival,
        duration: durationVal,
        price: b.price !== undefined ? parseFloat(b.price) : 500,
        seats: availableSeatsVal,
        rating: b.rating !== undefined ? parseFloat(b.rating) : 4.0,
        amenities: b.amenities || ["Water Bottle", "Charging Point"],
        status: b.status || "ACTIVE"
      };
    });

    applyFiltersAndSort();
  } catch (error) {
    showToast("Error retrieving matching buses.", "error");
    console.error(error);

    // If the API returns an error, display "Unable to fetch buses. Please try again."
    const container = document.getElementById("busResultsContainer");
    if (container) {
      container.innerHTML = `
              <div class="card card-custom p-5 text-center shadow-sm">
                <i class="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
                <h4 class="fw-bold text-danger">Search Failed</h4>
                <p class="text-muted">Unable to fetch buses. Please try again.</p>
              </div>
            `;
    }
  } finally {
    hideLoader();
  }
}

// UI filter label updater
function updatePriceLabel(val) {
  currentPriceMax = parseInt(val);
  document.getElementById("priceVal").innerText = `₹${val}`;
  applyFiltersAndSort();
}

// Star button rating handler
function setRatingFilter(val) {
  minRatingFilter = val;

  // Highlight active filter button
  document.querySelectorAll(".star-filter-btn").forEach(btn => {
    btn.classList.replace("btn-danger", "btn-outline-secondary");
  });

  const activeBtn = document.getElementById(`starBtn${val}`);
  if (activeBtn) {
    activeBtn.classList.replace("btn-outline-secondary", "btn-danger");
  }

  applyFiltersAndSort();
}

// Clear all input filter overrides
function clearAllFilters() {
  document.querySelectorAll(".filter-checkbox, .filter-checkbox-time").forEach(c => c.checked = false);

  const range = document.getElementById("priceRange");
  if (range) {
    range.value = 2500;
    updatePriceLabel(2500);
  }

  setRatingFilter(0);
  showToast("Filters reset successfully.", "info");
}

// Apply check filters and sort
function applyFiltersAndSort() {
  let filtered = [...allBuses];

  // 1. Bus Type Checklist Filter
  const selectedTypes = Array.from(document.querySelectorAll(".filter-checkbox:checked")).map(c => c.value);
  if (selectedTypes.length > 0) {
    filtered = filtered.filter(bus => selectedTypes.includes(bus.type));
  }

  // 2. Price Max Range Filter
  filtered = filtered.filter(bus => bus.price <= currentPriceMax);

  // 3. Minimum Rating Filter
  if (minRatingFilter > 0) {
    filtered = filtered.filter(bus => bus.rating >= minRatingFilter);
  }

  // 4. Departure Timings Filter
  const selectedTimes = Array.from(document.querySelectorAll(".filter-checkbox-time:checked")).map(c => c.value);
  if (selectedTimes.length > 0) {
    filtered = filtered.filter(bus => {
      const departureHour = parseInt(bus.departure.split(":")[0]);

      let match = false;
      if (selectedTimes.includes("morning") && departureHour >= 5 && departureHour < 12) match = true;
      if (selectedTimes.includes("afternoon") && departureHour >= 12 && departureHour < 18) match = true;
      if (selectedTimes.includes("evening") && (departureHour >= 18 || departureHour < 5)) match = true;
      return match;
    });
  }

  // 5. Sorting
  if (activeSortType === 'price') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (activeSortType === 'duration') {
    filtered.sort((a, b) => parseDurationToMinutes(a.duration) - parseDurationToMinutes(b.duration));
  } else if (activeSortType === 'rating') {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  renderBusResults(filtered);
}

// Convert "16h 30m" -> 990 minutes
function parseDurationToMinutes(durStr) {
  const parts = durStr.toLowerCase().split(" ");
  let mins = 0;
  parts.forEach(p => {
    if (p.includes("h")) mins += parseInt(p.replace("h", "")) * 60;
    if (p.includes("m")) mins += parseInt(p.replace("m", ""));
  });
  return mins || 99999;
}

// Change sorts
function sortResults(type) {
  activeSortType = type;
  document.querySelectorAll(".sort-btn").forEach(btn => btn.classList.remove("active"));

  if (type === 'price') document.getElementById("sortPrice").classList.add("active");
  if (type === 'duration') document.getElementById("sortDuration").classList.add("active");
  if (type === 'rating') document.getElementById("sortRating").classList.add("active");

  applyFiltersAndSort();
}

// Render dynamic results
function renderBusResults(buses) {
  const container = document.getElementById("busResultsContainer");
  const countLabel = document.getElementById("resultsCount");

  if (!container) return;
  container.innerHTML = "";
  countLabel.innerText = `${buses.length} Bus${buses.length === 1 ? "" : "es"} found`;

  // Friendly illustration or icon when no buses match the search route.
  if (allBuses.length === 0) {
    container.innerHTML = `
          <div class="card card-custom p-5 text-center shadow-sm">
            <div class="mb-3">
              <i class="bi bi-bus-front fs-1 text-muted" style="opacity: 0.6;"></i>
            </div>
            <h4 class="fw-bold">No buses available for the selected route.</h4>
            <p class="text-muted">Currently there are no registered bus services running between these cities.</p>
            <a href="home.html" class="btn btn-outline-danger btn-sm mx-auto mt-2 px-4 shadow-sm">
              <i class="bi bi-arrow-left me-1"></i> Modify Search
            </a>
          </div>
        `;
    return;
  }

  if (buses.length === 0) {
    container.innerHTML = `
          <div class="card card-custom p-5 text-center shadow-sm">
            <i class="bi bi-funnel fs-1 text-muted mb-3"></i>
            <h4 class="fw-bold">No Buses Found</h4>
            <p class="text-muted">No operating buses match your selected filter criteria. Try resetting filters.</p>
            <button class="btn btn-danger btn-sm mx-auto mt-2 px-4" onclick="clearAllFilters()">Reset All Filters</button>
          </div>
        `;
    return;
  }

  buses.forEach(b => {
    // Generate star/favorite indicators
    const isWished = isBusWishlisted(b.id);
    const wishIcon = isWished ? "bi-heart-fill text-danger" : "bi-heart text-muted";

    // Split amenities array mock display
    const amenitiesText = b.amenities.map(a => `
          <span class="badge bg-light text-secondary me-1 py-1 px-2 border rounded-pill" title="${a}">
            ${getAmenityIconMarkup(a)} ${a}
          </span>
        `).join("");

    // AC/Non-AC badge calculation
    const isAC = b.type.toUpperCase().includes("AC") && !b.type.toUpperCase().includes("NON-AC") && !b.type.toUpperCase().includes("NON AC");
    const acBadgeMarkup = isAC
      ? `<span class="badge bg-success-subtle text-success border border-success fw-semibold ms-2 px-2 py-1" style="font-size: 0.75rem;">AC</span>`
      : `<span class="badge bg-secondary-subtle text-secondary border border-secondary fw-semibold ms-2 px-2 py-1" style="font-size: 0.75rem;">Non-AC</span>`;

    // Status badge markup
    const statusBadgeMarkup = b.status === "ACTIVE"
      ? `<span class="badge bg-success text-white fw-semibold px-2 py-1 ms-2" style="font-size: 0.72rem;"><i class="bi bi-check-circle me-1"></i>Active</span>`
      : `<span class="badge bg-warning text-dark fw-semibold px-2 py-1 ms-2" style="font-size: 0.72rem;"><i class="bi bi-info-circle me-1"></i>${b.status}</span>`;

    const card = document.createElement("div");
    card.className = "bus-card-expanded card-custom";
    card.innerHTML = `
          <div class="row align-items-center">
            <!-- Operator & Type info -->
            <div class="col-md-4 mb-3 mb-md-0">
              <div class="d-flex align-items-center gap-2 mb-1">
                <h5 class="fw-bold mb-0 text-dark">${b.name}</h5>
                ${acBadgeMarkup}
                ${statusBadgeMarkup}
                <button class="btn p-0 border-0 bg-transparent ms-2" onclick="toggleWish('${b.id}', event)" aria-label="Add to wishlist">
                  <i class="bi ${wishIcon} fs-5"></i>
                </button>
              </div>
              <p class="text-muted small mb-2"><i class="bi bi-tag-fill me-1 text-danger"></i>${b.type} | Reg: ${b.number}</p>
              <div class="text-muted small mb-2"><i class="bi bi-signpost-split-fill me-1 text-primary"></i><strong>Route:</strong> ${b.fromCity} &rarr; ${b.toCity}</div>
              <div class="d-flex align-items-center gap-2">
                <span class="rating-badge ${b.rating < 4.0 ? "low" : ""}"><i class="bi bi-star-fill"></i> ${b.rating.toFixed(1)}</span>
                <span class="text-muted small fw-semibold">Satisfied Riders</span>
              </div>
            </div>

            <!-- Schedule / Journey times -->
            <div class="col-md-5 mb-3 mb-md-0">
              <div class="row align-items-center text-center text-md-start">
                <div class="col-5">
                  <div class="bus-time">${b.departure}</div>
                  <div class="small fw-semibold text-muted text-uppercase">${routeFrom}</div>
                </div>
                
                <div class="col-2 text-center px-0">
                  <div class="bus-duration">
                    <span>${b.duration}</span>
                  </div>
                </div>
                
                <div class="col-5 text-md-end text-center">
                  <div class="bus-time">${b.arrival}</div>
                  <div class="small fw-semibold text-muted text-uppercase">${routeTo}</div>
                </div>
              </div>
            </div>

            <!-- Ticket pricing & Seats action click -->
            <div class="col-md-3 text-md-end text-center">
              <div class="text-muted small">Fare Starts At</div>
              <div class="bus-price text-danger mb-2">₹${b.price}</div>
              <div class="text-muted small mb-2 fw-semibold text-warning">${b.seats} Seats Available</div>
              <button class="btn btn-danger w-100 btn-md rounded-8 fw-semibold" onclick="handleBookSeatClick('${b.id}')">
                View Seats <i class="bi bi-arrow-right-short"></i>
              </button>
            </div>
          </div>
          
          <!-- Amenities list ribbon -->
          <div class="border-top mt-3 pt-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div class="d-flex flex-wrap align-items-center">
              <span class="text-muted small fw-bold me-2">Amenities: </span>
              ${amenitiesText}
            </div>
            <div>
              <span class="text-success small fw-semibold"><i class="bi bi-shield-check me-1"></i>Assured Trip</span>
            </div>
          </div>
        `;
    container.appendChild(card);
  });
}

// Maps Amenity String to Bootstrap icon
function getAmenityIconMarkup(name) {
  const iconMap = {
    "Wi-Fi": "bi-wifi",
    "Water Bottle": "bi-droplet",
    "Blanket": "bi-badge-ad",
    "Charging Point": "bi-phone",
    "Reading Light": "bi-lightbulb-fill"
  };
  return `<i class="bi ${iconMap[name] || "bi-info-circle"} text-muted"></i>`;
}

// Save bus route state and go to Seat selection page
function handleBookSeatClick(busId) {
  // Navigate passing busId using URL param (seat.html?busId=BUS101)
  window.location.href = `seat.html?busId=${busId}`;
}

// LocalStorage wishlist state check helpers
function isBusWishlisted(busId) {
  const wl = JSON.parse(localStorage.getItem("wishlist") || "[]");
  return wl.includes(busId);
}

// Toggle favorites
function toggleWish(busId, event) {
  event.stopPropagation();
  let wl = JSON.parse(localStorage.getItem("wishlist") || "[]");
  if (wl.includes(busId)) {
    wl = wl.filter(id => id !== busId);
    showToast("Removed from favorites.", "info");
  } else {
    wl.push(busId);
    showToast("Added to favorites!", "success");
  }
  localStorage.setItem("wishlist", JSON.stringify(wl));
  applyFiltersAndSort();
}

function logoutUser() {
  localStorage.clear();
  window.location.href = "login.html";
}

// Convert 12-hour structured time string (e.g. "09:00 AM") to 24-hour (e.g. "09:00")
function convert12hTo24h(timeStr) {
  if (!timeStr) return "00:00";
  const parts = timeStr.trim().split(/\s+/);
  if (parts.length < 2) return timeStr;

  const timeVal = parts[0];
  const modifier = parts[1].toUpperCase();

  let [hours, minutes] = timeVal.split(":");
  if (hours === "12") {
    hours = "00";
  }
  if (modifier === "PM") {
    hours = String(parseInt(hours, 10) + 12);
  }

  // pad hours
  if (hours.length === 1) hours = "0" + hours;
  return `${hours}:${minutes}`;
}