import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";

const API_URL = "https://taxibackend-two.vercel.app";

const sriLankaBounds = [
  [5.9189, 79.6524],
  [9.8293, 81.9623],
];
const centerSriLanka = [7.8731, 80.7718];

const BookingRoutes = ({ user }) => {
  const [currentPos, setCurrentPos] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routeInfo, setRouteInfo] = useState({ distance: 0, duration: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startName, setStartName] = useState("Detecting your location...");
  const [endName, setEndName] = useState("Select destination");
  const [bookingStatus, setBookingStatus] = useState(null);
  const [pollStatus, setPollStatus] = useState("idle"); // idle, polling, timeout, found
  const mapRef = useRef();
  const routingControlRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = [position.coords.latitude, position.coords.longitude];
          console.log("Got current position:", pos);
          setCurrentPos(pos);
          if (mapRef.current) {
            mapRef.current.setView(pos, 13);
          }
        },
        (error) => {
          console.warn("Geolocation denied, using default:", error);
          setCurrentPos(centerSriLanka);
          setStartName("Colombo");
          if (mapRef.current) {
            mapRef.current.setView(centerSriLanka, 8);
          }
        }
      );
    }
  }, []);

  const getLocationName = async (lat, lon) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`
      );
      const data = await response.json();
      const addr = data.address;
      let name = addr.city || addr.town || addr.village || addr.county || "Location";
      return name;
    } catch (err) {
      console.error("Geocoding error:", err);
      return "Unknown Location";
    }
  };

  useEffect(() => {
    if (currentPos) {
      getLocationName(currentPos[0], currentPos[1]).then(setStartName);
    }
  }, [currentPos]);

  useEffect(() => {
    if (destination) {
      getLocationName(destination[0], destination[1]).then(setEndName);
    }
  }, [destination]);

  useEffect(() => {
    if (!mapRef.current || !currentPos || !destination) return;

    try {
      if (routingControlRef.current && mapRef.current && mapRef.current.removeLayer) {
        mapRef.current.removeLayer(routingControlRef.current);
      }
    } catch (removeErr) {
      console.warn("Failed to remove old route layer:", removeErr);
    } finally {
      routingControlRef.current = null;
    }

    const calculateRoute = async () => {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${currentPos[1]},${currentPos[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=true`
        );
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distanceKm = route.distance / 1000;
          const durationMin = Math.ceil(route.duration / 60);

          setRouteInfo({
            distance: parseFloat(distanceKm.toFixed(2)),
            duration: durationMin,
          });

          if (route.geometry && route.geometry.coordinates) {
            const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
            const polyline = L.polyline(coords, { color: "blue", weight: 5, opacity: 0.7 }).addTo(mapRef.current);
            routingControlRef.current = polyline;
            try {
              if (polyline && polyline.getBounds && mapRef.current && mapRef.current.fitBounds) {
                mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
              }
            } catch (fitErr) {
              console.warn("fitBounds failed:", fitErr);
            }
          }
        }
      } catch (err) {
        console.error("Route calculation error:", err);
      }
    };

    calculateRoute();
  }, [currentPos, destination]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?countrycodes=LK&format=json&q=${encodeURIComponent(
            searchQuery
          )}&limit=5`
        );
        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const selectPlace = (place) => {
    const dest = [parseFloat(place.lat), parseFloat(place.lon)];
    setDestination(dest);
    setSearchQuery("");
    setSuggestions([]);
    if (mapRef.current) {
      mapRef.current.flyTo(dest, 13);
    }
  };

  const handleRefresh = () => {
    setDestination(null);
    setSearchQuery("");
    setSuggestions([]);
    setRouteInfo({ distance: 0, duration: 0 });
    setEndName("Select destination");
    setBookingStatus(null);
    setPollStatus("idle");
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (mapRef.current && currentPos) {
      mapRef.current.setView(currentPos, 13);
    }
  };

  // ✅ OPTIMIZED POLL FOR BOOKING STATUS WITH TIMEOUT
  const pollBookingStatus = (bookingId, token) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    let pollCount = 0;
    
    const poll = async () => {
      pollCount++;
      
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => abortControllerRef.current.abort(), 8000); // 8 second timeout

      console.log(`📡 Poll #${pollCount} for booking ${bookingId}`);
      setPollStatus("polling");

      try {
        // Try the /status endpoint first
        const response = await axios.get(
          `${API_URL}/api/bookings/${bookingId}/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: abortControllerRef.current.signal,
          }
        );

        clearTimeout(timeoutId);
        const data = response.data;
        const status = data.status || data.bookingStatus;
        const assignedDriver = data.assignedDriver || data.driver;

        console.log(`✅ Booking Status: ${status}`, data);
        setBookingStatus(status);

        if (status === "DRIVER_ASSIGNED" || status === "ACCEPTED") {
          setPollStatus("found");
          const driverInfo = assignedDriver || {};
          alert(`🎉 Driver found!\n\nDriver: ${driverInfo.name || 'Unknown'}\nContact: ${driverInfo.mobile || 'N/A'}`);
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          handleRefresh();
        } else if (status === "FINISHED" || status === "COMPLETED" || status === "CANCELLED") {
          setPollStatus("idle");
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch (err) {
        clearTimeout(timeoutId);

        if (err.code === 'ECONNABORTED' || axios.isCancel(err)) {
          console.warn("⏱️ Poll request timed out - retrying...");
          setPollStatus("timeout");
          // Continue polling despite timeout
          return;
        }

        if (err.response?.status === 404) {
          console.log("⚠️ /status endpoint not found, trying regular endpoint...");
          try {
            const fallbackResponse = await axios.get(
              `${API_URL}/api/bookings/${bookingId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            const booking = fallbackResponse.data;
            console.log(`✅ Booking Status (fallback): ${booking.status}`, booking);
            setBookingStatus(booking.status);
            setPollStatus("idle");

            if (booking.status === "ACCEPTED") {
              setPollStatus("found");
              alert(`🎉 Driver found!\n\nDriver: ${booking.driverName || 'Unknown'}\nContact: ${booking.driverPhone || 'N/A'}`);
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              handleRefresh();
            }
          } catch (fallbackErr) {
            console.error("❌ Both endpoints failed:", fallbackErr.message);
            setPollStatus("idle");
          }
        } else {
          console.error("❌ Error polling:", err.message);
          setPollStatus("idle");
        }
      }
    };

    // Poll immediately
    poll();

    // Then poll every 3 seconds (more lenient than 2 seconds)
    pollIntervalRef.current = setInterval(poll, 3000);
  };

  const saveRoute = async () => {
    if (!currentPos || !destination) {
      alert("Please select both pickup and destination!");
      return;
    }

    if (routeInfo.distance === 0) {
      alert("Please wait for route calculation!");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please login first!");
      return;
    }

    setIsSubmitting(true);

    try {
      const fare = (routeInfo.distance * 50).toFixed(2);

      console.log("📤 Sending booking request...", {
        startLocation: startName,
        endLocation: endName,
        distance: routeInfo.distance,
        estimatedTime: routeInfo.duration,
        estimatedFare: parseFloat(fare),
      });

      // Add timeout to booking request too
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await axios.post(
        `${API_URL}/api/bookings`,
        {
          startLocation: startName,
          endLocation: endName,
          distance: routeInfo.distance,
          estimatedTime: routeInfo.duration,
          estimatedFare: parseFloat(fare),
          pickupCoords: currentPos,
          dropoffCoords: destination,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      console.log("📥 Booking Response:", response.data);

      const bookingId = response.data.bookingId || response.data._id || response.data.id;
      
      if (!bookingId) {
        alert("❌ Error: No booking ID returned from server");
        console.error("No booking ID in response:", response.data);
        return;
      }

      setBookingStatus("PENDING");

      alert(
        `✅ Booking Confirmed!

From: ${startName}
To: ${endName}
Distance: ${routeInfo.distance} km
Duration: ${routeInfo.duration} min
Fare: Rs ${fare}

Booking ID: ${bookingId}
Status: PENDING - Finding driver...`
      );

      // ✅ START OPTIMIZED POLLING FOR UPDATES
      console.log(`🔄 Starting to poll for booking ${bookingId}`);
      pollBookingStatus(bookingId, token);
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        alert("Booking request timed out. Please try again.");
      } else {
        console.error("❌ Booking error:", err.response?.data || err.message);
        alert(
          `Booking failed: ${
            err.response?.data?.message || err.message
          }`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCurrentUser = () => localStorage.getItem("userName") || "Guest";

  return (
    <div className="flex justify-center w-full p-0 relative bg-gray-100 min-h-screen">
      <div className="w-full max-w-6xl relative">
        
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md">
          <input
            type="text"
            placeholder="Search destination in Sri Lanka..."
            className="w-full p-3 rounded-xl bg-white shadow-2xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-400 placeholder-gray-500 text-gray-900 font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {suggestions.length > 0 && (
            <ul className="absolute top-full left-0 right-0 bg-white border border-gray-300 z-50 max-h-48 overflow-auto rounded-b-xl shadow-lg">
              {suggestions.map((place) => (
                <li
                  key={place.place_id}
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                  onClick={() => selectPlace(place)}
                >
                  <p className="font-medium text-sm">
                    {place.display_name.split(",")[0]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {place.display_name.split(",").slice(1, 2).join(",")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg overflow-hidden shadow-lg relative z-0">
         <MapContainer
              center={centerSriLanka}
              zoom={8}
              minZoom={7}
              maxZoom={15}
              maxBounds={sriLankaBounds}
              maxBoundsViscosity={1}
              style={{ height: "100vh", width: "100vw" }} 
              ref={mapRef} >

  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution="&copy; OpenStreetMap contributors" />

  {currentPos && (
    <Marker position={currentPos}>
      <Popup>Your Location</Popup>
    </Marker>
  )}

  {destination && (
    <Marker position={destination}>
      <Popup>Destination</Popup>
    </Marker>
  )}
</MapContainer>
        </div>

        {currentPos && (
          <div className="absolute bottom-10 left-10 bg-white shadow-2xl rounded-2xl p-6 w-[420px] text-center z-50 border border-gray-100">
            <h2 className="text-1xl font-bold mb-4 text-gray-900 flex items-center justify-center">
              <span className="mr-2 text-blue-600"></span> TOUR DETAILS CARD
            </h2>

            <div className="text-left mb-6 space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  From
                </p>
                <p className="font-semibold text-base text-gray-800">
                  {startName}
                </p>
              </div>

              <hr className="border-gray-200" />

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  To
                </p>
                <p className="font-semibold text-base text-gray-800">
                  {endName}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-indigo-50 rounded-xl">
                <p className="text-xs text-indigo-700 font-medium mb-1">
                  Distance
                </p>
                <p className="text-xl font-bold text-indigo-900">
                  {routeInfo.distance || 0} km
                </p>
              </div>

              <div className="p-3 bg-yellow-50 rounded-xl">
                <p className="text-xs text-yellow-700 font-medium mb-1">
                  Duration
                </p>
                <p className="text-xl font-bold text-yellow-900">
                  {routeInfo.duration || 0} min
                </p>
              </div>

              <div className="p-3 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700 font-medium mb-1">
                  Fare
                </p>
                <p className="text-xl font-bold text-green-900">
                  Rs {(routeInfo.distance * 50).toFixed(2)}
                </p>
              </div>
            </div>

            {bookingStatus && (
              <div className={`text-sm font-semibold p-2 rounded mb-3 ${
                bookingStatus === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                (bookingStatus === "ACCEPTED" || bookingStatus === "DRIVER_ASSIGNED") ? "bg-green-100 text-green-800" :
                "bg-red-100 text-red-800"
              }`}>
                Status: {
                  bookingStatus === "PENDING" ? "⏳ Finding driver..." : 
                  bookingStatus === "DRIVER_ASSIGNED" || bookingStatus === "ACCEPTED" ? "✅ Driver found!" :
                  bookingStatus
                }
              </div>
            )}

            {pollStatus === "polling" && (
              <div className="text-xs text-blue-600 font-medium mb-3">
                🔄 Searching for driver...
              </div>
            )}

            {pollStatus === "timeout" && (
              <div className="text-xs text-orange-600 font-medium mb-3">
                ⏱️ Connection timeout - retrying...
              </div>
            )}

            <p className="text-sm text-gray-600 font-medium mt-4 border-t border-gray-200 pt-3">
              User: <span className="font-semibold">{getCurrentUser()}</span>
            </p>

            <button
              onClick={saveRoute}
              disabled={!destination || routeInfo.distance === 0 || isSubmitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold text-base shadow-md transition-all mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? "⏳ Submitting..."
                : routeInfo.distance === 0 && destination
                ? "Calculating..."
                : "Confirm Booking"}
            </button>


          </div>
        )}

        <div className="absolute top-20 left-4 flex flex-col gap-2 z-50">
          <button
            onClick={handleRefresh}
            className="bg-white text-gray-900 px-4 py-2 rounded-lg shadow-md border hover:bg-gray-50 transition"
          >
            New Route
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingRoutes;