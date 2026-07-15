// Global Admin state
let busesList = [];
let deleteTargetId = "";
let busModalInstance = null;
let deleteModalInstance = null;

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    // Access control check
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!isAdmin) {
        showToast("Access Denied. Admin privileges required.", "error");
        setTimeout(() => window.location.href = "home.html", 1500);
        return;
    }

    // Register Bootstrap Modals
    const busM = document.getElementById("busModal");
    if (busM) busModalInstance = new bootstrap.Modal(busM);

    const delM = document.getElementById("deleteConfirmModal");
    if (delM) deleteModalInstance = new bootstrap.Modal(delM);

    // Load metrics stats and bus table
    loadAdminDashboard();
});

// Load all stats and buses
async function loadAdminDashboard() {
    showLoader("Loading admin records...");
    try {
        // 1. Fetch Buses
        busesList = await getBuses();

        // 2. Fetch Mock db sizes for other metrics
        const usersArr = JSON.parse(localStorage.getItem("users") || "[]");
        const bookingsArr = JSON.parse(localStorage.getItem("bookings") || "[]");

        // 3. Populate stats UI elements (calculating totals)
        document.getElementById("statTotalBuses").innerText = busesList.length;
        document.getElementById("statTotalUsers").innerText = usersArr.length + 1; // +1 to count admin/base seed user
        document.getElementById("statTotalBookings").innerText = bookingsArr.length;

        // Revenue from confirmed bookings
        const totalRev = bookingsArr
            .filter(b => b.status === "Confirmed")
            .reduce((sum, b) => sum + (parseFloat(b.amountPaid) || 0), 0);
        document.getElementById("statRevenue").innerText = `₹${totalRev}`;

        // 4. Render Table list
        renderBusesTable(busesList);

    } catch (error) {
        showToast("Failed to fetch admin stats.", "error");
        console.error(error);
    } finally {
        hideLoader();
    }
}

// Render dynamic tables
function renderBusesTable(buses) {
    const tbody = document.getElementById("adminBusListTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (buses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No operating buses found in system.</td></tr>`;
        return;
    }

    buses.forEach(b => {
        const row = document.createElement("tr");
        row.innerHTML = `
      <td class="fw-bold text-dark">${b.name}</td>
      <td>${b.number}</td>
      <td><span class="badge bg-light text-secondary border">${b.type}</span></td>
      <td>${b.fromCity} &rarr; ${b.toCity}</td>
      <td>${b.departure} / ${b.arrival} <small class="text-muted">(${b.duration})</small></td>
      <td class="fw-bold text-danger">₹${b.price}</td>
      <td>
        <div class="btn-group gap-1">
          <button class="btn btn-sm btn-outline-primary px-2" onclick="triggerEditBusModal('${b.id}')" title="Edit Bus">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger px-2" onclick="triggerDeleteModal('${b.id}')" title="Delete Bus">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
        tbody.appendChild(row);
    });
}

// Reset/Clear Forms
function resetBusForm() {
    document.getElementById("editBusIdVal").value = "";
    document.getElementById("busName").value = "";
    document.getElementById("busNumber").value = "";
    document.getElementById("busType").value = "";
    document.getElementById("totalSeats").value = "30";
    document.getElementById("fromCityVal").value = "";
    document.getElementById("toCityVal").value = "";
    document.getElementById("depTime").value = "18:00";
    document.getElementById("arrTime").value = "09:00";
    document.getElementById("busFare").value = "";

    document.querySelectorAll("#busForm input, #busForm select").forEach(el => {
        el.classList.remove("is-invalid");
    });
}

// Add/Create new Mode
function triggerAddBusModal() {
    resetBusForm();
    document.getElementById("busModalLabel").innerText = "Add Bus Operator";
    if (busModalInstance) busModalInstance.show();
}

// Edit Mode
function triggerEditBusModal(busId) {
    resetBusForm();
    document.getElementById("busModalLabel").innerText = "Edit Bus Operator Details";

    const bus = busesList.find(b => b.id === busId);
    if (!bus) return;

    document.getElementById("editBusIdVal").value = bus.id;
    document.getElementById("busName").value = bus.name;
    document.getElementById("busNumber").value = bus.number;
    document.getElementById("busType").value = bus.type;
    document.getElementById("totalSeats").value = bus.seats;
    document.getElementById("fromCityVal").value = bus.fromCity;
    document.getElementById("toCityVal").value = bus.toCity;
    document.getElementById("depTime").value = bus.departure;
    document.getElementById("arrTime").value = bus.arrival;
    document.getElementById("busFare").value = bus.price;

    if (busModalInstance) busModalInstance.show();
}

// Trigger Delete
function triggerDeleteModal(busId) {
    deleteTargetId = busId;
    document.getElementById("deleteModalBusId").innerText = busId;
    if (deleteModalInstance) deleteModalInstance.show();
}

// CRUD Submit action
async function handleBusFormSubmit(event) {
    event.preventDefault();
    const form = document.getElementById("busForm");

    let isValid = true;
    document.querySelectorAll("#busForm input, #busForm select").forEach(el => {
        if (el.hasAttribute("required") && !el.value) {
            el.classList.add("is-invalid");
            isValid = false;
        } else {
            el.classList.remove("is-invalid");
        }
    });

    const fareVal = parseFloat(document.getElementById("busFare").value);
    if (isNaN(fareVal) || fareVal <= 0) {
        document.getElementById("busFare").classList.add("is-invalid");
        isValid = false;
    }

    if (!isValid) return;

    const busId = document.getElementById("editBusIdVal").value;
    const name = document.getElementById("busName").value.trim();
    const number = document.getElementById("busNumber").value.trim();
    const type = document.getElementById("busType").value;
    const seats = parseInt(document.getElementById("totalSeats").value);
    const fromCity = document.getElementById("fromCityVal").value.trim();
    const toCity = document.getElementById("toCityVal").value.trim();
    const departure = document.getElementById("depTime").value;
    const arrival = document.getElementById("arrTime").value;
    const price = fareVal;

    const durationStr = calculateDuration(departure, arrival);

    const busData = {
        name,
        number,
        type,
        seats,
        fromCity,
        toCity,
        departure,
        arrival,
        duration: durationStr,
        price,
        rating: 4.2, // Seed default rating for new inserts
        amenities: ["Wi-Fi", "Charging Point", "Water Bottle"] // Default starter amenities
    };

    showLoader("Saving bus config...");

    try {
        let result;
        if (busId) {
            // Edit Update mode
            result = await updateBus(busId, busData);
        } else {
            // Add/Insert mode
            result = await addBus(busData);
        }

        if (result.success) {
            if (busModalInstance) busModalInstance.hide();
            showToast(busId ? "Bus updated successfully!" : "Bus added successfully!", "success");
            loadAdminDashboard();
        } else {
            showToast(result.message || "Failed to save bus info.", "error");
        }
    } catch (error) {
        showToast("Error invoking admin update API.", "error");
        console.error(error);
    } finally {
        hideLoader();
    }
}

// Delete Confirm Execution
async function executeBusDelete() {
    if (deleteModalInstance) deleteModalInstance.hide();

    showLoader("Deleting operator...");
    try {
        const result = await deleteBus(deleteTargetId);

        if (result.success) {
            showToast("Bus deleted from registry.", "success");
            loadAdminDashboard();
        } else {
            showToast(result.message || "Delete failed.", "error");
        }
    } catch (error) {
        showToast("Error invoking delete API.", "error");
        console.error(error);
    } finally {
        hideLoader();
    }
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}
