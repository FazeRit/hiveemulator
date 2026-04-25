import axios from "axios";

export const fetchCenterCoordinates = async (apiUrl) => {
    if (!apiUrl) return null;
    try {
        const response = await axios.get(`${apiUrl}/area`);
        return response.data;
    } catch (error) {
        console.error("Error fetching center:", error);
        return null;
    }
};

export const fetchHives = async (apiUrl) => {
    if (!apiUrl) return [];
    try {
        const response = await axios.get(`${apiUrl}/hive`);
        return response.data.map(hive => ({
            id: hive.HiveID,
            lat: hive.Telemetry?.Location?.Latitude ?? null,
            lon: hive.Telemetry?.Location?.Longitude ?? null,
        })).filter(hive => hive.lat !== null && hive.lon !== null);
    } catch (error) {
        console.error("Error fetching hives:", error);
        return [];
    }
};

export const fetchInterferences = async (apiUrl) => {
    if (!apiUrl) return [];
    try {
        const response = await axios.get(`${apiUrl}/interferences`);
        return response.data.map(i => ({
            id: i.Id,
            lat: i.Location?.Latitude ?? null,
            lon: i.Location?.Longitude ?? null,
            radiusKM: i.RadiusKM,
            radiusMeters: i.RadiusKM * 1000
        })).filter(i => i.lat !== null && i.lon !== null);
    } catch (error) {
        console.error("Error fetching interferences:", error);
        return [];
    }
};

export const moveHives = async (apiUrl, lat, lon, ids) => {
    try {
        await axios.patch(`${apiUrl}/hive`, { 
            Hives: ids, 
            Destination: { Latitude: lat, Longitude: lon } 
        });
    } catch (error) {
        console.error("Error moving hives:", error);
        throw error;
    }
};

export const addInterference = async (apiUrl, lat, lon, radiusMeters) => {
    try {
        const response = await axios.post(`${apiUrl}/interference`, {
            RadiusKM: radiusMeters / 1000,
            Location: { Latitude: parseFloat(lat), Longitude: parseFloat(lon) }
        });
        return response.data;
    } catch (error) {
        console.error("Error adding interference:", error);
        throw error;
    }
};

export const deleteInterference = async (apiUrl, interferenceId) => {
    try {
        await axios.delete(`${apiUrl}/interference/${interferenceId}`);
    } catch (error) {
        console.error("Error deleting interference:", error);
        throw error;
    }
};

export const stopHiveMove = async (apiUrl, ids) => {
    try {
        await axios.post(`${apiUrl}/hive/stop`, { Hives: ids });
    } catch (error) {
        console.error("Error stopping hive:", error);
        throw error;
    }
};