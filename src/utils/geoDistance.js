'use strict';

/**
 * Known landmark coordinates in Deoghar, Jharkhand.
 * Extend this object to add more landmarks without changing business logic.
 *
 * Coordinates are approximate; replace with surveyed values for production.
 */
const LANDMARK_COORDINATES = {
  'Baba Baidyanath Temple': { lat: 24.4880, lng: 86.6968 },
  'Tower Chowk':            { lat: 24.4867, lng: 86.6952 },
  'AIIMS Deoghar':          { lat: 24.4601, lng: 86.7139 },
  'Trikut Pahar':           { lat: 24.4285, lng: 86.6571 },
};

/**
 * haversineDistance
 * Returns the great-circle distance between two lat/lng points in kilometres.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in km
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's mean radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * formatDistance
 * Returns a human-readable distance string.
 * < 1 km → "850m"
 * ≥ 1 km → "2.3km"
 *
 * @param {number} km
 * @returns {string}
 */
const formatDistance = (km) => {
  const metres = Math.round(km * 1000);
  if (metres < 1000) return `${metres}m`;
  return `${(km).toFixed(1)}km`;
};

/**
 * computeLandmarkDistances
 * Given a room's [lat, lng] coordinates, returns an array of distance objects
 * for every known landmark — ready to be stored in `Room.landmarkDistances`.
 *
 * @param {number} lat - room latitude
 * @param {number} lng - room longitude
 * @returns {Array<{landmark, distanceText, distanceM}>}
 */
const computeLandmarkDistances = (lat, lng) => {
  return Object.entries(LANDMARK_COORDINATES).map(([landmark, coords]) => {
    const km = haversineDistance(lat, lng, coords.lat, coords.lng);
    return {
      landmark,
      distanceText: formatDistance(km),
      distanceM: Math.round(km * 1000),
    };
  });
};

/**
 * distanceFromLandmark
 * Returns the distance in metres from a room (given its coords) to a named landmark.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} landmarkName
 * @returns {{ distanceText: string, distanceM: number } | null}
 */
const distanceFromLandmark = (lat, lng, landmarkName) => {
  const coords = LANDMARK_COORDINATES[landmarkName];
  if (!coords) return null;
  const km = haversineDistance(lat, lng, coords.lat, coords.lng);
  return { distanceText: formatDistance(km), distanceM: Math.round(km * 1000) };
};

module.exports = {
  LANDMARK_COORDINATES,
  haversineDistance,
  formatDistance,
  computeLandmarkDistances,
  distanceFromLandmark,
};
