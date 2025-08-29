// ===== Utilities =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Wheel related variables
let currentRestaurants = [];
let isSpinning = false;
let wheelCanvas;
let wheelCtx;
const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
  '#D4A5A5', '#9B9B9B', '#A8E6CF', '#FFD3B6', '#FF8B94'
];

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

// ===== DOM refs =====
const amenitySel = $("#amenity");
const cuisineInput = $("#cuisine");
const radiusRange = $("#radius");
const radiusOut = $("#radiusOut");
const btnLocate = $("#btnLocate");
const btnSearch = $("#btnSearch");
const btnClear = $("#btnClear");
const latInput = $("#lat");
const lonInput = $("#lon");
const statusBox = $("#status");
const resultsEl = $("#results");

// reflect radius
radiusRange.addEventListener("input", () => {
  radiusOut.textContent = `${radiusRange.value} m`;
});

// quick geolocate
btnLocate.addEventListener("click", async () => {
  try {
    status("กำลังขอตำแหน่ง…");
    const pos = await getPosition();
    latInput.value = pos.coords.latitude.toFixed(6);
    lonInput.value = pos.coords.longitude.toFixed(6);
    status("ได้พิกัดแล้ว ✔");
  } catch (e) {
    console.error(e);
    status("ไม่สามารถขอตำแหน่งได้ กรุณาอนุญาต Location หรือกรอกพิกัดเอง", true);
  }
});

// search
btnSearch.addEventListener("click", async () => {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  const radius = parseInt(radiusRange.value, 10);
  if (!isFinite(lat) || !isFinite(lon)) {
    status("กรุณาใช้ปุ่ม 'ใช้ตำแหน่งฉัน' หรือกรอกพิกัด lat/lon ให้ถูกต้อง", true);
    return;
  }
  const amenity = amenitySel.value.trim();          // may be ""
  const cuisine = cuisineInput.value.trim().toLowerCase(); // keyword in cuisine tag

  resultsEl.innerHTML = "";
  btnSearch.disabled = true;
  status("กำลังค้นหาในบริเวณโดยรอบ…");

  try {
    const items = await searchNearby({ lat, lon, radius, amenity, cuisine });
    if (!items.length) {
      status("ไม่พบร้านในเงื่อนไขนี้ ลองเพิ่มรัศมีหรือเปลี่ยนตัวกรองดูครับ", true);
      btnSearch.disabled = false;
      return;
    }

    // sort by distance and render
    items.sort((a, b) => a._distance - b._distance);
    currentRestaurants = items; // Store for wheel
    renderList(items);
    status(`พบทั้งหมด ${items.length} แห่ง ในรัศมี ${fmtDist(radius)} ✓`);
    
    // Show random button if more than 1 restaurant found
    randomButtonContainer.style.display = items.length > 1 ? "block" : "none";
  } catch (err) {
    console.error(err);
    status("เกิดข้อผิดพลาดระหว่างดึงข้อมูล ลองใหม่อีกครั้ง", true);
  } finally {
    btnSearch.disabled = false;
  }
});

// ===== Core logic =====
function status(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? "#fca5a5" : "var(--muted)";
}

// Clear search function
function clearSearch() {
  // Reset form inputs
  amenitySel.value = "restaurant";  // Set back to default
  cuisineInput.value = "";         // Clear cuisine
  radiusRange.value = "100";       // Reset radius
  radiusOut.textContent = "100 m"; // Update radius display
  latInput.value = "";             // Clear coordinates
  lonInput.value = "";
  
  // Clear results
  resultsEl.innerHTML = "";
  
  // Reset status
  status("พร้อมค้นหา…");
}

// Add clear button handler
btnClear.addEventListener("click", clearSearch);

// Wheel functions
function initWheel() {
  wheelCanvas = $("#wheelCanvas");
  wheelCtx = wheelCanvas.getContext("2d");
  wheelCanvas.width = 500;
  wheelCanvas.height = 500;
}

function drawWheel() {
  const centerX = wheelCanvas.width / 2;
  const centerY = wheelCanvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;
  
  wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
  
  const totalSlices = currentRestaurants.length;
  const arcAngle = (2 * Math.PI) / totalSlices;
  
  currentRestaurants.forEach((restaurant, index) => {
    const startAngle = index * arcAngle;
    const endAngle = startAngle + arcAngle;
    
    // Draw slice
    wheelCtx.beginPath();
    wheelCtx.moveTo(centerX, centerY);
    wheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
    wheelCtx.fillStyle = colors[index % colors.length];
    wheelCtx.fill();
    
    // Draw text
    wheelCtx.save();
    wheelCtx.translate(centerX, centerY);
    wheelCtx.rotate(startAngle + arcAngle / 2);
    wheelCtx.textAlign = "right";
    wheelCtx.fillStyle = "#000000";
    wheelCtx.font = "14px Arial";
    const name = restaurant.tags.name || "ร้านอาหาร";
    wheelCtx.fillText(name, radius - 20, 5);
    wheelCtx.restore();
  });
  
  // Draw center circle
  wheelCtx.beginPath();
  wheelCtx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
  wheelCtx.fillStyle = "#FFFFFF";
  wheelCtx.fill();
  wheelCtx.stroke();
}

function spinWheel() {
  if (isSpinning) return;
  isSpinning = true;
  
  const totalSpins = 5; // Number of full rotations
  const spinDuration = 5000; // Duration in milliseconds
  const startAngle = 0;
  // ปรับให้หยุดที่ตำแหน่งขวาพอดี (เพิ่ม Math.PI/2)
  const endAngle = 2 * Math.PI * totalSpins + (Math.random() * 2 * Math.PI) + Math.PI/2;
  const startTime = performance.now();
  
  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / spinDuration, 1);
    
    // Easing function for smooth deceleration
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const currentRotation = startAngle + (endAngle * easeOut(progress));
    
    wheelCtx.save();
    wheelCtx.translate(wheelCanvas.width / 2, wheelCanvas.height / 2);
    wheelCtx.rotate(currentRotation);
    wheelCtx.translate(-wheelCanvas.width / 2, -wheelCanvas.height / 2);
    drawWheel();
    wheelCtx.restore();
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      // ปรับการคำนวณ index ให้ตรงกับตำแหน่งของสามเหลี่ยม
      const normalizedRotation = (-currentRotation + Math.PI/2) % (2 * Math.PI);
      const winningIndex = Math.floor((normalizedRotation / (2 * Math.PI)) * currentRestaurants.length);
      const winner = currentRestaurants[winningIndex];
      showWinner(winner);
    }
  }
  
  requestAnimationFrame(animate);
}

function showWinner(restaurant) {
  const name = restaurant.tags.name || "ร้านอาหาร";
  const cuisine = restaurant.tags.cuisine ? `(${restaurant.tags.cuisine})` : '';
  const distance = fmtDist(restaurant._distance);
  
  // สร้าง popup div แทนการใช้ alert
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 1001;
    text-align: center;
    animation: fadeIn 0.3s;
  `;
  
  popup.innerHTML = `
    <h3 style="margin: 0 0 10px">🎉 ร้านที่คุณได้คือ</h3>
    <div style="font-size: 1.2em; margin: 10px 0">
      <strong>${name}</strong>
      <div style="color: var(--muted); font-size: 0.9em">${cuisine}</div>
      <div style="color: var(--accent); margin-top: 5px">ห่างจากคุณ ${distance}</div>
    </div>
    <button class="primary" style="margin-top: 15px" onclick="this.parentElement.remove()">
      ตกลง
    </button>
  `;
  
  document.body.appendChild(popup);
  
  // เพิ่ม overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    animation: fadeIn 0.3s;
  `;
  document.body.appendChild(overlay);
  
  // ลบ popup และ overlay เมื่อคลิก overlay
  overlay.onclick = () => {
    popup.remove();
    overlay.remove();
  };
}

// Modal functions
const modal = $("#wheelModal");
const btnRandom = $("#btnRandom");
const btnSpin = $("#btnSpin");
const randomButtonContainer = $("#randomButtonContainer");
const closeBtn = $(".close");

btnRandom.addEventListener("click", () => {
  modal.style.display = "block";
  drawWheel();
});

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

btnSpin.addEventListener("click", spinWheel);

// Initialize wheel on load
initWheel();

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 0
    });
  });
}

async function searchNearby({ lat, lon, radius, amenity, cuisine }) {
  // Build an Overpass QL query
  // - We fetch nodes/ways/relations with amenity in the shortlist
  // - If user picked a specific amenity, narrow at query-time for efficiency.
  const amenityList = ["restaurant","cafe","fast_food","bar","pub","biergarten","food_court","ice_cream","bakery"];
  const filterAmenity = amenity ? [amenity] : amenityList;

  const around = `around:${radius},${lat},${lon}`;
  const union = filterAmenity.map(a => `node[amenity=${a}](${around});way[amenity=${a}](${around});relation[amenity=${a}](${around});`).join("\n");

  const query = `
[out:json][timeout:25];
(
  ${union}
);
out center tags;
`;

  const endpoint = "https://overpass-api.de/api/interpreter";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type":"text/plain;charset=UTF-8"},
    body: query
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();
  const elements = data.elements || [];

  // Normalize items {name, lat, lon, tags, type}
  let items = elements.map(el => {
    const latlon = el.type === "node" ? { lat: el.lat, lon: el.lon } :
                   el.center ? { lat: el.center.lat, lon: el.center.lon } : null;
    const tags = el.tags || {};
    const name = tags.name || tags["name:en"] || "(ไม่มีชื่อ)";
    return latlon ? {
      id: `${el.type}/${el.id}`,
      name,
      lat: latlon.lat,
      lon: latlon.lon,
      tags
    } : null;
  }).filter(Boolean);

  // Cuisine filter (client-side keyword match)
  if (cuisine) {
    items = items.filter(it => {
      const c = (it.tags.cuisine || "").toLowerCase();
      return c.includes(cuisine);
    });
  }

  // De-duplicate by (name+coords) roughly
  const seen = new Set();
  items = items.filter(it => {
    const key = `${it.name}|${it.lat.toFixed(5)},${it.lon.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Compute distance
  for (const it of items) {
    it._distance = haversine(lat, lon, it.lat, it.lon);
  }

  // Keep within radius (safety, though Overpass already did around)
  return items.filter(it => it._distance <= radius + 1);
}

function renderList(items) {
  resultsEl.innerHTML = "";
  for (const it of items) {
    const cuisine = it.tags.cuisine ? `ครัว: ${it.tags.cuisine}` : null;
    const phone = it.tags.phone ||  it.tags["contact:phone"] || null;
    const opening = it.tags.opening_hours || null;
    const addr = [
      it.tags["addr:housenumber"], it.tags["addr:street"], it.tags["addr:suburb"], it.tags["addr:city"]
    ].filter(Boolean).join(" ");

    const li = document.createElement("li");
    li.className = "card";

    const title = document.createElement("h3");
    title.textContent = it.name;
    li.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    const dist = document.createElement("span");
    dist.innerHTML = `ระยะทาง <span class="distance">${fmtDist(it._distance)}</span>`;
    meta.appendChild(dist);

    if (opening) {
      const oh = document.createElement("span");
      oh.textContent = `เวลาเปิด: ${opening}`;
      meta.appendChild(oh);
    }

    if (addr) {
      const ad = document.createElement("span");
      ad.textContent = addr;
      meta.appendChild(ad);
    }
    li.appendChild(meta);

    const badges = document.createElement("div");
    badges.className = "badges";
    const amenity = it.tags.amenity ? tagBadge(it.tags.amenity) : null;
    if (amenity) badges.appendChild(amenity);
    if (cuisine) badges.appendChild(tagBadge(cuisine));
    if (phone) badges.appendChild(tagBadge(`โทร: ${phone}`));
    li.appendChild(badges);

    const actions = document.createElement("div");
    actions.className = "actions";
    const osmA = document.createElement("a");
    osmA.className = "btn";
    osmA.href = `https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=19/${it.lat}/${it.lon}`;
    osmA.target = "_blank";
    osmA.rel = "noopener";
    osmA.textContent = "ดูแผนที่";
    actions.appendChild(osmA);

    li.appendChild(actions);

    resultsEl.appendChild(li);
  }
}

function tagBadge(text){
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = text;
  return span;
}

// ===== Smart defaults: try to pre-fill location on load =====
(async function init(){
  try {
    // tether radius output
    radiusOut.textContent = `${radiusRange.value} m`;
    // try geolocate silently
    const pos = await getPosition();
    latInput.value = pos.coords.latitude.toFixed(6);
    lonInput.value = pos.coords.longitude.toFixed(6);
    status("พิกัดถูกเติมอัตโนมัติแล้ว ✓");
  } catch {
    status("ทิป: คลิก '📍 ใช้ตำแหน่งฉัน' เพื่อเติมพิกัดอัตโนมัติ");
  }
})();
