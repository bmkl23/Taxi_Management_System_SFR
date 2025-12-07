import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = 'https://taxibackend-two.vercel.app/api/drivers';
const BOOKINGS_API = 'https://taxibackend-two.vercel.app/api/bookings';

const DriverDashboard = () => {
  const navigate = useNavigate();
  const [driverInfo, setDriverInfo] = useState(null);
  const [status, setStatus] = useState('OFFLINE');
  const [isAvailable, setIsAvailable] = useState(false);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [pollStatus, setPollStatus] = useState('idle'); // idle, polling, paused
  const [pollInterval, setPollInterval] = useState(5000); // Start with 5 seconds
  const pollIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  const token = localStorage.getItem('token');
  const driverId = localStorage.getItem('userId');
  const driverName = localStorage.getItem('userName');

  // Fetch driver profile
  const fetchDriverProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/${driverId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDriverInfo(response.data);
      setStatus(response.data.status || 'OFFLINE');
      setIsAvailable(response.data.isAvailable || false);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching driver profile:', error);
      localStorage.clear();
      navigate('/');
    }
  };

  // ✅ OPTIMIZED FETCH PENDING BOOKINGS - With timeout and error handling
  const fetchAvailableRides = async () => {
    if (!isAvailable) {
      setRides([]);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortControllerRef.current.abort(), 8000); // 8 second timeout

    try {
      setPollStatus('polling');
      console.log('🔍 Polling for new rides...');

      const response = await axios.get(`${BOOKINGS_API}/pending`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortControllerRef.current.signal
      });

      clearTimeout(timeoutId);

      if (response.data && response.data.length > 0) {
        console.log(`📱 Found ${response.data.length} pending bookings`);
        setRides(response.data);
        
        // Speed up polling when we have rides (check every 1 second)
        if (pollInterval !== 1000) {
          setPollInterval(1000);
        }
      } else {
        setRides([]);
        
        // Slow down polling when no rides (check every 10 seconds)
        if (pollInterval !== 10000) {
          setPollInterval(10000);
        }
      }
      
      setLastChecked(new Date().toLocaleTimeString());
      setPollStatus('idle');
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.code === 'ECONNABORTED') {
        console.warn('⏱️ Poll request timed out - skipping this check');
        setPollStatus('paused');
      } else if (axios.isCancel(error)) {
        console.log('📍 Previous poll cancelled');
      } else {
        console.error('❌ Error fetching rides:', error.message);
        setPollStatus('idle');
      }
      
      setRides([]);
    }
  };

  // Toggle availability
  const toggleAvailability = async () => {
    setUpdating(true);
    try {
      const response = await axios.patch(
        `${API_URL}/${driverId}/availability`,
        { isAvailable: !isAvailable },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const newAvailability = response.data.driver.isAvailable;
      setIsAvailable(newAvailability);
      setStatus(response.data.driver.status);
      
      if (!newAvailability) {
        setRides([]);
        setPollStatus('idle');
        console.log('✅ Driver went offline');
      } else {
        console.log('✅ Driver is now online - starting polling');
        setPollInterval(5000); // Reset to 5 seconds when going online
        // Immediately fetch rides when going online
        await fetchAvailableRides();
      }
    } catch (error) {
      console.error('Availability update failed:', error);
      alert('Failed to update availability');
    } finally {
      setUpdating(false);
    }
  };

  // Accept ride
  const handleAccept = async (rideId) => {
    try {
      const response = await axios.patch(
        `${BOOKINGS_API}/${rideId}/accept`,
        { driverId, driverName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('✅ Ride accepted:', response.data);
      
      // Remove from list
      setRides((prev) => prev.filter((r) => r._id !== rideId));
      
      // Show confirmation
      alert(`🎉 Ride accepted!\nBooking ID: ${rideId}`);
      
      // Navigate to ride details
      navigate(`/booking/${rideId}`);
    } catch (error) {
      console.error('Error accepting ride:', error);
      alert(`Failed to accept ride: ${error.response?.data?.message || error.message}`);
    }
  };

  // Decline ride
  const handleDecline = async (rideId) => {
    try {
      await axios.patch(
        `${BOOKINGS_API}/${rideId}/decline`,
        { driverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('👋 Ride declined:', rideId);
      setRides((prev) => prev.filter((r) => r._id !== rideId));
    } catch (error) {
      console.error('Error declining ride:', error);
      alert(`Failed to decline ride: ${error.response?.data?.message || error.message}`);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchDriverProfile();
  }, [driverId]);

  // ✅ SMART POLLING - Adaptive interval based on ride availability
  useEffect(() => {
    if (!isAvailable) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Clear existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Fetch immediately
    fetchAvailableRides();

    // Set up polling with current interval
    pollIntervalRef.current = setInterval(() => {
      fetchAvailableRides();
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAvailable, pollInterval, token]);

  const handleLogout = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    localStorage.clear();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-700">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-600 text-white p-4 rounded shadow-md gap-3">
        <h1 className="text-lg sm:text-xl font-semibold">Driver Dashboard</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
            isAvailable ? 'bg-green-500' : 'bg-gray-500'
          }`}>
            {isAvailable ? '🟢 Online' : '🔴 Offline'}
          </span>
          <button 
            onClick={handleLogout} 
            className="px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-xs sm:text-sm font-medium transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Driver Info */}
      <div className="bg-white rounded shadow p-4 sm:p-5 space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">Welcome, {driverName}!</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-700 text-xs sm:text-sm">
          <p><strong>Email:</strong> {driverInfo?.email}</p>
          <p><strong>Mobile:</strong> {driverInfo?.mobile}</p>
          <p><strong>Vehicle:</strong> {driverInfo?.vehicle_number || 'N/A'}</p>
          <p>
            <strong>Status:</strong>
            <span className={`ml-2 px-2 py-1 rounded-full text-white text-xs ${
              status === 'AVAILABLE' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {status}
            </span>
          </p>
        </div>
        <button
          onClick={toggleAvailability}
          disabled={updating}
          className={`mt-3 w-full px-4 py-2 rounded text-sm font-medium text-white transition ${
            updating 
              ? 'bg-gray-400 cursor-not-allowed' 
              : isAvailable 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {updating ? 'Updating...' : isAvailable ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {/* Polling Status - IMPROVED */}
      {isAvailable && (
        <div className={`border rounded p-3 text-xs sm:text-sm font-medium transition ${
          pollStatus === 'polling' 
            ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
            : pollStatus === 'paused'
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <p>
            ⏱️ Polling every {(pollInterval / 1000).toFixed(0)} seconds
            {pollStatus === 'polling' && ' (fetching...)'}
            {pollStatus === 'paused' && ' (⚠️ request timeout - retrying...)'}
          </p>
          {lastChecked && <p className="text-xs mt-1">Last checked: {lastChecked}</p>}
          {rides.length > 0 && <p className="text-xs mt-1">📊 Faster polling active (rides available)</p>}
        </div>
      )}

      {/* Ride Requests */}
      <div className="bg-white rounded shadow p-4 sm:p-5">
        <h2 className="text-sm sm:text-base font-semibold mb-4">
          🚗 Ride Requests ({rides.length})
        </h2>

        {rides.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs sm:text-sm">
            {isAvailable ? (
              <>
                <p className="text-lg mb-2">📭</p>
                <p className="font-medium">No active ride requests</p>
                <p className="mt-1 text-xs">Waiting for new bookings...</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">🔴</p>
                <p className="font-medium">You are offline</p>
                <p className="mt-1 text-xs">Go online to receive ride requests</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {rides.map((ride) => (
              <div 
                key={ride._id} 
                className="border border-gray-300 rounded-lg p-4 hover:shadow-lg transition bg-gradient-to-r from-blue-50 to-purple-50"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-2 text-gray-700 text-xs sm:text-sm flex-1">
                    <p className="font-semibold text-base">
                      📍 <span className="text-blue-600">{ride.startLocation || ride.pickup}</span>
                    </p>
                    <p className="font-semibold text-base">
                      🎯 <span className="text-purple-600">{ride.endLocation || ride.drop}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3 p-2 bg-white rounded">
                      <p>
                        <strong>Distance:</strong> {ride.distance || ride.distance_km} km
                      </p>
                      <p>
                        <strong>Time:</strong> {ride.estimatedTime || ride.time_minutes} mins
                      </p>
                    </div>
                    <p className="font-bold text-green-600 text-base mt-2">
                      💰 Fare: Rs {ride.estimatedFare || ride.estimated_fare}
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => handleAccept(ride._id)} 
                      className="flex-1 sm:flex-none px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm font-bold transition transform hover:scale-105"
                    >
                      ✅ Accept
                    </button>
                    <button 
                      onClick={() => handleDecline(ride._id)} 
                      className="flex-1 sm:flex-none px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs sm:text-sm font-bold transition transform hover:scale-105"
                    >
                      ❌ Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;