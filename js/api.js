// API Configuration
const API_URL = "https://bf3qk1ru2j.execute-api.ap-south-1.amazonaws.com/prod";

// Helper checking if API is configured/accessible
let isOfflineMode = false;

// Toast Notification Manager
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container") || createToastContainer();
  const toast = document.createElement("div");
  toast.className = `custom-toast toast-${type}`;

  let icon = "bi-check-circle-fill text-success";
  if (type === "error") icon = "bi-exclamation-triangle-fill text-danger";
  if (type === "warning") icon = "bi-exclamation-circle-fill text-warning";

  toast.innerHTML = `
    <i class="bi ${icon} fs-5"></i>
    <div class="toast-body-text flex-grow-1">${message}</div>
    <button type="button" class="btn-close ms-2" onclick="this.parentElement.remove()"></button>
  `;
  container.appendChild(toast);

  // Trigger transition
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.id = "toast-container";
  document.body.appendChild(container);
  return container;
}

// Show/Hide Loading Overlay Spinner
function showLoader(text = "Loading...") {
  let loader = document.getElementById("full-page-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "full-page-loader";
    loader.className = "full-page-loader";
    loader.innerHTML = `
      <div class="loader-spinner"></div>
      <div class="text-muted fw-bold" id="loader-text">${text}</div>
    `;
    document.body.appendChild(loader);
  } else {
    document.getElementById("loader-text").innerText = text;
    loader.style.display = "flex";
  }
}

function hideLoader() {
  const loader = document.getElementById("full-page-loader");
  if (loader) {
    loader.style.display = "none";
  }
}

// Toggle Dark/Light Mode
function initTheme() {
  const currentTheme = localStorage.getItem("theme");
  if (currentTheme === "dark") {
    document.body.classList.add("dark-mode");
  }

  // Set navbar theme icon
  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const isDark = document.body.classList.contains("dark-mode");
    btn.innerHTML = isDark ? '<i class="bi bi-sun-fill text-warning"></i>' : '<i class="bi bi-moon-fill"></i>';
  }
}

// LocalStorage Simulation Mock Data setup
const DEFAULT_BUSES = [
  {
    id: "bus_101",
    name: "RedBus Express",
    number: "DL 01 AT 8844",
    type: "AC Sleeper",
    fromCity: "Delhi",
    toCity: "Mumbai",
    departure: "18:00",
    arrival: "10:30",
    duration: "16h 30m",
    price: 1850,
    seats: 30,
    rating: 4.8,
    amenities: ["Wi-Fi", "Water Bottle", "Blanket", "Charging Point", "Reading Light"]
  },
  {
    id: "bus_102",
    name: "Vande Bharat Sleeper",
    number: "MH 12 QW 9900",
    type: "AC Sleeper",
    fromCity: "Mumbai",
    toCity: "Pune",
    departure: "07:30",
    arrival: "11:15",
    duration: "3h 45m",
    price: 650,
    seats: 40,
    rating: 4.5,
    amenities: ["Water Bottle", "Charging Point", "Reading Light"]
  },
  {
    id: "bus_103",
    name: "IntrCity SmartBus",
    number: "KA 03 AA 4321",
    type: "AC Seater",
    fromCity: "Bangalore",
    toCity: "Chennai",
    departure: "14:15",
    arrival: "20:30",
    duration: "6h 15m",
    price: 920,
    seats: 36,
    rating: 4.2,
    amenities: ["Wi-Fi", "Charging Point", "Water Bottle"]
  },
  {
    id: "bus_104",
    name: "Zingbus Sleeper",
    number: "HR 55 TR 1234",
    type: "Non-AC Sleeper",
    fromCity: "Delhi",
    toCity: "Jaipur",
    departure: "22:30",
    arrival: "04:30",
    duration: "6h 00m",
    price: 490,
    seats: 32,
    rating: 3.9,
    amenities: ["Blanket", "Reading Light"]
  },
  {
    id: "bus_105",
    name: "SRM Transports",
    number: "TN 07 EX 4567",
    type: "AC Sleeper",
    fromCity: "Chennai",
    toCity: "Hyderabad",
    departure: "20:00",
    arrival: "07:00",
    duration: "11h 00m",
    price: 1450,
    seats: 30,
    rating: 4.6,
    amenities: ["Wi-Fi", "Water Bottle", "Blanket", "Charging Point"]
  }
];

function initMockDatabase() {
  if (!localStorage.getItem("buses")) {
    localStorage.setItem("buses", JSON.stringify(DEFAULT_BUSES));
  }
  if (!localStorage.getItem("users")) {
    localStorage.setItem("users", JSON.stringify([]));
  }
  if (!localStorage.getItem("bookings")) {
    localStorage.setItem("bookings", JSON.stringify([]));
  }
  if (!localStorage.getItem("seats_occupancy")) {
    // Structure: { "busId_date": ["A1", "A2", "B5"] }
    localStorage.setItem("seats_occupancy", JSON.stringify({
      "bus_101_2026-07-16": ["A1", "A2", "B5", "C3", "D10"],
      "bus_102_2026-07-16": ["A5", "A6", "A7", "B8", "B9"],
      "bus_103_2026-07-16": ["C1", "C2", "D1", "D2"]
    }));
  }
}

// Check session
function checkSession() {
  const userId = localStorage.getItem("userId");
  const currentPage = window.location.pathname.split("/").pop();

  if (!userId && currentPage !== "login.html" && currentPage !== "register.html" && currentPage !== "index.html" && currentPage !== "") {
    window.location.href = "login.html";
  }
}

// Invoke the initialization on load
initTheme();
initMockDatabase();
document.addEventListener("DOMContentLoaded", checkSession);

// API Functions
async function registerUser(fullName, email, mobile, password) {
  try {
    let response = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, mobile, password })
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    throw new Error(data.message || "Registration failed");
  } catch (error) {
    console.error("AWS Endpoint Register failed, running LocalStorage mock...", error);
    // Simulation fallback
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.find(u => u.email === email)) {
      return { success: false, message: "Email already registered" };
    }
    const newUser = { id: "user_" + Date.now(), name: fullName, email, mobile, password };
    users.push(newUser);
    localStorage.setItem("users", JSON.stringify(users));
    return { success: true, data: { userId: newUser.id, name: newUser.name, email: newUser.email, mobile: newUser.mobile } };
  }
}

async function loginUserAPI(email, password) {
  try {
    let response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    throw new Error(data.message || "Login failed");
  } catch (error) {
    console.error("AWS Endpoint Login failed, running LocalStorage mock...", error);
    // Administrative login shortcut
    if (email === "admin" && password === "admin123") {
      return { success: true, data: { userId: "admin_id", name: "System Admin", email: "admin", isAdmin: true } };
    }
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
      return { success: true, data: { userId: user.id, name: user.name, email: user.email, mobile: user.mobile } };
    }
    return { success: false, message: "Invalid email or password" };
  }
}

async function getBuses() {
  try {
    let response = await fetch(`${API_URL}/buses`);
    let data = await response.json();
    if (response.ok) return data;
    return JSON.parse(localStorage.getItem("buses"));
  } catch (error) {
    console.error("AWS Endpoint Fetch Buses failed, running LocalStorage mock...", error);
    return JSON.parse(localStorage.getItem("buses"));
  }
}

async function searchBuses(fromCity, toCity, travelDate) {
  let response = await fetch(`${API_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromCity, toCity, journeyDate: travelDate })
  });
  let data = await response.json();
  if (response.ok) return data;
  throw new Error(data.message || "Failed to fetch buses.");
}

async function addBus(busDetails) {
  try {
    let response = await fetch(`${API_URL}/addbus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(busDetails)
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    return { success: false, message: data.message || "Failed to add bus" };
  } catch (error) {
    console.error("AWS Endpoint Add Bus failed, running LocalStorage mock...", error);
    const buses = JSON.parse(localStorage.getItem("buses") || "[]");
    const newBus = {
      id: "bus_" + Date.now(),
      name: busDetails.busName,
      number: busDetails.busNumber,
      type: busDetails.busType,
      fromCity: busDetails.fromCity,
      toCity: busDetails.toCity,
      departure: busDetails.departure,
      arrival: busDetails.arrival,
      duration: calculateDuration(busDetails.departure, busDetails.arrival),
      price: parseFloat(busDetails.price),
      seats: parseInt(busDetails.totalSeats),
      rating: 5.0,
      amenities: ["Water Bottle", "Charging Point", "Reading Light"]
    };
    buses.push(newBus);
    localStorage.setItem("buses", JSON.stringify(buses));
    return { success: true, data: newBus };
  }
}

// Admin API updates
async function updateBus(id, updatedDetails) {
  // Simulating PUT /api/buses/:id or equivalent AWS Endpoint
  try {
    let response = await fetch(`${API_URL}/updatebus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updatedDetails })
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    throw new Error();
  } catch (error) {
    console.error("AWS Endpoint Update Bus failed. Running LocalStorage update simulation...");
    const buses = JSON.parse(localStorage.getItem("buses") || "[]");
    const idx = buses.findIndex(b => b.id === id);
    if (idx !== -1) {
      buses[idx] = { ...buses[idx], ...updatedDetails };
      localStorage.setItem("buses", JSON.stringify(buses));
      return { success: true, data: buses[idx] };
    }
    return { success: false, message: "Bus not found" };
  }
}

async function deleteBus(id) {
  // Simulating DELETE /api/buses/:id or equivalent AWS Endpoint
  try {
    let response = await fetch(`${API_URL}/deletebus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    let data = await response.json();
    if (response.ok) return { success: true };
    throw new Error();
  } catch (error) {
    console.error("AWS Endpoint Delete Bus failed. Running LocalStorage delete simulation...");
    const buses = JSON.parse(localStorage.getItem("buses") || "[]");
    const filtered = buses.filter(b => b.id !== id);
    localStorage.setItem("buses", JSON.stringify(filtered));
    return { success: true };
  }
}

async function bookSeats(bookingDetails) {
  try {
    // Determine the active payment method dynamically if possible
    let paymentMethod = "Online Payment";
    const activeTabEl = document.querySelector("#paymentTabs .list-group-item.active");
    if (activeTabEl) {
      if (activeTabEl.id === "card-tab") paymentMethod = "Debit/Credit Card";
      else if (activeTabEl.id === "net-tab") paymentMethod = "Net Banking";
      else if (activeTabEl.id === "upi-tab") paymentMethod = "UPI";
    }

    const bookingIds = [];
    const seats = bookingDetails.seats || [];
    const passengers = bookingDetails.passenger || [];

    // Step 1: Reserve each seat/passenger individually via AWS Lambdas (POST /book)
    for (let idx = 0; idx < passengers.length; idx++) {
      const passenger = passengers[idx];
      const seatNum = seats[idx] || passenger.seatNumber;

      const singlePayload = {
        userId: bookingDetails.userId,
        busId: bookingDetails.busId,
        seatNumber: seatNum,
        passengerName: passenger.name,
        age: parseInt(passenger.age),
        gender: passenger.gender,
        phone: bookingDetails.phone || localStorage.getItem("userPhone") || "9999988888",
        email: bookingDetails.email || localStorage.getItem("userEmail") || "passenger@gmail.com",
        journeyDate: bookingDetails.travelDate,
        price: parseFloat((bookingDetails.price / passengers.length).toFixed(2))
      };

      let bookResponse = await fetch(`${API_URL}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(singlePayload)
      });

      let bookData = await bookResponse.json();
      if (!bookResponse.ok) {
        throw new Error(bookData.message || "Failed to reserve seat: " + seatNum);
      }

      bookingIds.push(bookData.bookingId);
    }

    // Step 2: Pay for each created booking via POST /payment
    for (let idx = 0; idx < bookingIds.length; idx++) {
      const bId = bookingIds[idx];
      const singlePrice = parseFloat((bookingDetails.price / bookingIds.length).toFixed(2));

      let payResponse = await fetch(`${API_URL}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: bId,
          paymentMethod: paymentMethod,
          amount: singlePrice,
          userId: bookingDetails.userId
        })
      });

      let payData = await payResponse.json();
      if (!payResponse.ok) {
        throw new Error(payData.message || "Payment verification failed for booking: " + bId);
      }
    }

    return { success: true, bookingId: bookingIds.join(", ") };

  } catch (error) {
    console.error("AWS Endpoint booking/payment flow failed, running LocalStorage mock...", error);

    // LocalStorage Fallback Simulation
    const bookings = JSON.parse(localStorage.getItem("bookings") || "[]");
    const occ = JSON.parse(localStorage.getItem("seats_occupancy") || "{}");
    const bookingId = "BK_" + Math.floor(100000 + Math.random() * 900000);

    const newBooking = {
      bookingId,
      userId: bookingDetails.userId,
      busId: bookingDetails.busId,
      busName: bookingDetails.busName,
      seats: bookingDetails.seats,
      fromCity: bookingDetails.fromCity,
      toCity: bookingDetails.toCity,
      travelDate: bookingDetails.travelDate,
      price: bookingDetails.price,
      passenger: bookingDetails.passenger,
      status: "Confirmed",
      amountPaid: bookingDetails.amountPaid
    };
    bookings.push(newBooking);
    localStorage.setItem("bookings", JSON.stringify(bookings));

    const key = `${bookingDetails.busId}_${bookingDetails.travelDate}`;
    if (!occ[key]) occ[key] = [];
    bookingDetails.seats.forEach(s => {
      if (!occ[key].includes(s)) occ[key].push(s);
    });
    localStorage.setItem("seats_occupancy", JSON.stringify(occ));

    return { success: true, bookingId };
  }
}

async function getMyBookings(userId) {
  try {
    let response = await fetch(`${API_URL}/mybookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    let data = await response.json();
    if (!response.ok) throw new Error();

    // Map AWS DynamoDB keys dynamically to frontend schemas
    return data.map(b => ({
      bookingId: b.bookingId,
      userId: b.userId,
      busId: b.busId,
      busName: b.busName || "Comfort Coach",
      seats: b.seats || (b.seatNumber ? [b.seatNumber] : []),
      fromCity: b.fromCity || "Departure Stop",
      toCity: b.toCity || "Arrival Stop",
      travelDate: b.journeyDate || b.travelDate,
      price: parseFloat(b.price || 0),
      passenger: [{
        seatNumber: b.seatNumber,
        name: b.passengerName,
        age: b.age,
        gender: b.gender
      }],
      status: b.bookingStatus === "CONFIRMED" ? "Confirmed" : (b.bookingStatus === "CANCELLED" ? "Cancelled" : "Pending"),
      amountPaid: parseFloat(b.price || 0)
    }));
  } catch (error) {
    console.error("AWS Endpoint Fetch MyBookings failed, running LocalStorage mock...", error);
    const bookings = JSON.parse(localStorage.getItem("bookings") || "[]");
    return bookings.filter(b => b.userId === userId);
  }
}

async function cancelBooking(bookingId, busId, seats, travelDate) {
  try {
    // If the bookingIds are comma separated combinations
    const ids = bookingId.split(",").map(id => id.trim());

    for (let id of ids) {
      let response = await fetch(`${API_URL}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: id,
          busId: busId,
          seats: seats.join ? seats.join(",") : seats,
          travelDate: travelDate
        })
      });
      let data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Cancellation failed for: " + id);
      }
    }
    return { success: true };
  } catch (error) {
    console.error("AWS Endpoint Cancel Booking failed, running LocalStorage mock...", error);
    const bookings = JSON.parse(localStorage.getItem("bookings") || "[]");
    const occ = JSON.parse(localStorage.getItem("seats_occupancy") || "{}");

    const bookingIdx = bookings.findIndex(b => b.bookingId === bookingId);
    if (bookingIdx !== -1) {
      bookings[bookingIdx].status = "Cancelled";
      localStorage.setItem("bookings", JSON.stringify(bookings));

      const key = `${busId}_${travelDate}`;
      if (occ[key]) {
        occ[key] = occ[key].filter(s => !seats.includes(s));
        localStorage.setItem("seats_occupancy", JSON.stringify(occ));
      }
      return { success: true };
    }
    return { success: false, message: error.message || "Booking not found" };
  }
}

// User Profile Actions (AWS /profile and /updateprofile)
async function getUserProfile(userId) {
  try {
    let response = await fetch(`${API_URL}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    throw new Error(data.message || "Failed to load profile");
  } catch (error) {
    console.warn("AWS Profile fetch failed, using offline session caching...", error);
    return {
      success: true,
      data: {
        userId,
        name: localStorage.getItem("userName") || "Passenger",
        email: localStorage.getItem("userEmail") || "passenger@gmail.com",
        phone: localStorage.getItem("userPhone") || "9999988888"
      }
    };
  }
}

async function updateUserProfile(userId, fullName, email, mobile) {
  try {
    let response = await fetch(`${API_URL}/updateprofile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fullName, email, mobile })
    });
    let data = await response.json();
    if (response.ok) return { success: true, data };
    throw new Error(data.message || "Failed to update profile");
  } catch (error) {
    console.warn("AWS Profile update failed, using offline session caching...", error);
    localStorage.setItem("userName", fullName);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userPhone", mobile);
    return {
      success: true,
      data: { userId, name: fullName, email, phone: mobile }
    };
  }
}

// Seat occupancy queries
async function getOccupiedSeats(busId, date) {
  try {
    let response = await fetch(`${API_URL}/seats?busId=${busId}&date=${date}`);
    let data = await response.json();
    if (response.ok) return data.occupiedSeats;
    throw new Error();
  } catch (error) {
    console.error("AWS Endpoint getSeats failed, checking LocalStorage mock...");
    const occ = JSON.parse(localStorage.getItem("seats_occupancy") || "{}");
    const key = `${busId}_${date}`;
    return occ[key] || [];
  }
}

// Calculate journey duration based on two HH:MM strings
function calculateDuration(dep, arr) {
  const [depH, depM] = dep.split(":").map(Number);
  const [arrH, arrM] = arr.split(":").map(Number);
  let dMins = (arrH * 60 + arrM) - (depH * 60 + depM);
  if (dMins < 0) dMins += 24 * 60; // Next day arrival

  const hrs = Math.floor(dMins / 60);
  const mins = dMins % 60;
  return `${hrs}h ${mins > 0 ? mins + "m" : "00m"}`;
}