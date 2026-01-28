import React, { useEffect, useState } from "react";
import axios from "axios";

const BOOKINGS_API = "https://taxibackend-two.vercel.app/api/bookings";

export default function TourHistoryPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const token = localStorage.getItem("token");

  const fetchBookings = async () => {
    try {
      if (!token) {
        setErrorMsg("No token found. Please log in as admin.");
        setLoading(false);
        return;
      }

      const res = await axios.get(`${BOOKINGS_API}/admin/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const processedBookings = res.data.map(booking => ({
        ...booking,
        user: typeof booking.user === 'object' ? booking.user : { name: "Guest", _id: booking.user },
        assigned_driver: typeof booking.assigned_driver === 'object' ? booking.assigned_driver : { name: "Unassigned", _id: booking.assigned_driver }
      }));

      setBookings(processedBookings);
      setErrorMsg("");
    } catch (err) {
      console.error("Failed to fetch bookings:", err.response || err);
      if (err.response?.status === 401) {
        setErrorMsg("Unauthorized. Invalid or expired token.");
      } else if (err.response?.status === 403) {
        setErrorMsg("Forbidden, Do not have access to this data.");
      } else {
        setErrorMsg("Failed to fetch bookings. Check server.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      fetchBookings();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [token]);

  if (loading) return <p className="text-gray-500 text-center mt-6">Loading bookings...</p>;
  if (errorMsg) return <p className="text-red-500 text-center mt-6">{errorMsg}</p>;

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">TOUR ROUTES GRID VIEW (Refreshing every 5 sec)</h1>

      {bookings.length === 0 ? (
        <p className="text-gray-500">No bookings found.</p>
      ) : (
        <div className="overflow-x-auto shadow-lg rounded-lg">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-indigo-600 text-white sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Booking ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Passenger</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Driver</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Pickup</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Drop</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Distance (km)</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Time (min)</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Fare (Rs)</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Payment</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b, idx) => {
                const userInitials = b.user?.name
                  ? b.user.name.split(" ").map((n) => n[0]).join("").toUpperCase()
                  : "GU";
                const shortId = b._id.toString().slice(-4).toUpperCase();
                const humanReadableId = `${userInitials}-${shortId}`;

                return (
                  <tr key={b._id} className={idx % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-gray-50 hover:bg-gray-100"}>
                    <td className="px-4 py-3 border-b text-sm font-mono text-gray-600 truncate">{humanReadableId}</td>
                    <td className="px-4 py-3 border-b text-sm font-medium">{b.user?.name || "Guest"}</td>
                    <td className="px-4 py-3 border-b text-sm font-medium">{b.assigned_driver?.name || "Unassigned"}</td>
                    <td className="px-4 py-3 border-b text-sm">{b.startLocation || b.pickup || "N/A"}</td>
                    <td className="px-4 py-3 border-b text-sm">{b.endLocation || b.drop || "N/A"}</td>
       <td className="px-4 py-3 border-b text-sm text-center">
  {b.distance ?? b.distance_km ?? 0}
</td>

<td className="px-4 py-3 border-b text-sm text-center">
  {b.estimatedTime ?? b.time_minutes ?? 0}
</td>

<td className="px-4 py-3 border-b text-sm font-semibold text-green-600">
  Rs {b.estimatedFare ?? b.estimated_fare ?? 0}
</td>
                    <td className="px-4 py-3 border-b text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        b.status === 'ONGOING' ? 'bg-blue-100 text-blue-700'
                        : b.status === 'DRIVER_PENDING' ? 'bg-yellow-100 text-yellow-700'
                        : b.status === 'CANCELLED' ? 'bg-red-100 text-red-700'
                        : b.status === 'NO_DRIVER_AVAILABLE' ? 'bg-gray-100 text-gray-700'
                        : 'bg-green-100 text-green-700'
                      }`}>
                        {b.status || "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        b.payment_status === 'PENDING' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {b.payment_status || "PENDING"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}