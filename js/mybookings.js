// Global Cancellation state
let cancelBookingId = "";
let cancelBusId = "";
let cancelSeats = [];
let cancelTravelDate = "";
let modalInstance = null;

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    // Check admin
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const adminNav = document.getElementById("admin-nav-item");
    if (adminNav && isAdmin) {
        adminNav.style.display = "block";
    }

    // Fetch bookings list
    fetchUserBookings();

    // Register modal instance
    const modalEl = document.getElementById("cancelModal");
    if (modalEl) {
        modalInstance = new bootstrap.Modal(modalEl);
    }
});

// Fetch user dynamic booking histories
async function fetchUserBookings() {
    const container = document.getElementById("bookingsListContainer");
    if (!container) return;

    const userId = localStorage.getItem("userId");
    showLoader("Retrieving your trips...");

    try {
        const bookings = await getMyBookings(userId);

        // Clear Skeletons
        container.innerHTML = "";

        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
        <div class="card card-custom p-5 text-center shadow-sm">
          <i class="bi bi-ticket-detailed fs-1 text-muted mb-3"></i>
          <h4 class="fw-bold">No Bookings Found</h4>
          <p class="text-muted">You haven't booked any bus tickets yet. Search and book comfortable routes on the dashboard.</p>
          <a href="home.html" class="btn btn-danger btn-sm mx-auto mt-2 px-4 shadow-sm">Book Ticket Now</a>
        </div>
      `;
            return;
        }

        // Sort bookings: Confirmed ones first, then by date descending
        bookings.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'Confirmed' ? -1 : 1;
            }
            return new Date(b.travelDate) - new Date(a.travelDate);
        });

        bookings.forEach(b => {
            const isConfirmed = b.status === "Confirmed";
            const statusBadge = isConfirmed
                ? '<span class="badge bg-success"><i class="bi bi-check-circle-fill me-1"></i>Confirmed</span>'
                : '<span class="badge bg-secondary"><i class="bi bi-x-circle-fill me-1"></i>Cancelled</span>';

            const card = document.createElement("div");
            card.className = "card card-custom p-4 mb-3 position-relative overflow-hidden";
            card.innerHTML = `
        <div class="row align-items-center">
          <div class="col-md-8">
            <div class="d-flex align-items-center gap-3 mb-2 flex-wrap">
              <span class="badge bg-light text-dark border">ID: ${b.bookingId}</span>
              ${statusBadge}
            </div>
            <h5 class="fw-bold text-dark mb-1">${b.busName}</h5>
            <p class="text-muted small mb-2">
              <i class="bi bi-arrow-right-circle text-danger me-1"></i>Route: <strong>${b.fromCity} &rarr; ${b.toCity}</strong> 
              <br>
              <i class="bi bi-calendar3 text-danger me-1"></i>Date: <strong>${formatDateFriendly(b.travelDate)}</strong>
            </p>
            <div class="d-flex gap-4 border-top pt-2">
              <div class="small">
                <span class="text-muted">Seat(s):</span> <strong class="text-danger">${b.seats.join(", ")}</strong>
              </div>
              <div class="small">
                <span class="text-muted">Paid:</span> <strong class="text-dark">₹${b.amountPaid}</strong>
              </div>
            </div>
          </div>
          
          <div class="col-md-4 text-md-end text-start mt-3 mt-md-0 d-flex flex-column gap-2 justify-content-center">
            ${isConfirmed ? `
              <button class="btn btn-outline-danger btn-sm w-100" onclick="triggerCancelModal('${b.bookingId}', '${b.busId}', '${encodeURIComponent(JSON.stringify(b.seats))}', '${b.travelDate}')">
                <i class="bi bi-x-square me-1"></i> Cancel Booking
              </button>
            ` : `
              <button class="btn btn-light btn-sm w-100 border text-muted" disabled>
                <i class="bi bi-dash-circle me-1"></i> Booking Closed
              </button>
            `}
          </div>
        </div>
      `;
            container.appendChild(card);
        });
    } catch (err) {
        showToast("Server lookup fail. Try again.", "error");
        container.innerHTML = `<div class="text-center text-muted">Error reloading records.</div>`;
        console.error(err);
    } finally {
        hideLoader();
    }
}

// Format Date
function formatDateFriendly(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Show cancel warning parameters modal overlay
function triggerCancelModal(bookingId, busId, seatsJson, date) {
    cancelBookingId = bookingId;
    cancelBusId = busId;
    cancelSeats = JSON.parse(decodeURIComponent(seatsJson));
    cancelTravelDate = date;

    document.getElementById("cancelModalId").innerText = bookingId;

    if (modalInstance) {
        modalInstance.show();
    }
}

// Call Cancellation API
async function executeCancellation() {
    if (modalInstance) {
        modalInstance.hide();
    }

    showLoader("Processing cancellation...");

    try {
        const result = await cancelBooking(cancelBookingId, cancelBusId, cancelSeats, cancelTravelDate);

        hideLoader();

        if (result.success) {
            showToast("Booking cancelled. Seat released back to grid.", "success");
            // Reload lists
            fetchUserBookings();
        } else {
            showToast(result.message || "Cancellation failed.", "error");
        }
    } catch (error) {
        hideLoader();
        showToast("Server failure during cancellation.", "error");
        console.error(error);
    }
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}
