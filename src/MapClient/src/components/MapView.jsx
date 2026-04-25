import React, { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import { Map, View, Feature } from "ol";
import TileLayer from "ol/layer/Tile";
import { OSM, Vector as VectorSource } from "ol/source";
import { Vector as VectorLayer } from "ol/layer";
import { fromLonLat, toLonLat } from "ol/proj";
import { Point, Circle as GeomCircle } from "ol/geom";
import { Style, Icon, Text, Fill, Stroke } from "ol/style";
import Popup from "./Popup";
import { 
    fetchCenterCoordinates, fetchHives, moveHives, 
    fetchInterferences, addInterference, deleteInterference, stopHiveMove 
} from "../api/mapService";

const MARKER_ICON_URL = "/256x256.png";

const MapView = () => {
    const mapRef = useRef(null);
    const vectorLayerRef = useRef(null);
    const initialized = useRef(false);

    // ✅ apiUrl тепер у useState, щоб тригерити логіку при отриманні адреси
    const [apiUrl, setApiUrl] = useState(null);
    const [hives, setHives] = useState([]);
    const [interferences, setInterferences] = useState([]);
    const [popup, setPopup] = useState({ visible: false, coords: null, type: 'map' });
    const [interferenceRadiusModal, setInterferenceRadiusModal] = useState({ visible: false, coords: null });
    const [mouseCoords, setMouseCoords] = useState({ lat: "", lon: "" });
    const popoverRef = useRef(null);

    // Крок 1: Завантажуємо конфігурацію
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const res = await fetch('/config.json');
                const data = await res.json();
                console.log("✅ Config loaded:", data.API_URL);
                setApiUrl(data.API_URL); 
            } catch (e) {
                console.error("❌ Failed to load config.json", e);
            }
        };
        loadConfig();
    }, []);

    // Крок 2: Коли apiUrl з'явився — ініціалізуємо мапу
    useEffect(() => {
        if (!apiUrl || initialized.current) return;
        initialized.current = true;

        const startApp = async () => {
            const center = await fetchCenterCoordinates(apiUrl);
            if (center) {
                initMap(center.Latitude, center.Longitude);
                await refreshData();
            }
            // Запускаємо оновлення тільки коли маємо apiUrl
            const interval = setInterval(refreshData, 5000);
            return () => clearInterval(interval);
        };

        startApp();
    }, [apiUrl]);

    const refreshData = async () => {
        // Подвійний захист від undefined
        if (!apiUrl || apiUrl === "undefined") return;
        await fetchAndDrawHives();
        await fetchAndDrawInterferences();
    };

    const initMap = (lat, lon) => {
        const map = new Map({
            target: "map-container",
            layers: [new TileLayer({ source: new OSM() })],
            view: new View({ center: fromLonLat([lon, lat]), zoom: 12 }),
        });
        map.on("pointermove", (e) => handleMouseMove(e, map));
        map.on("singleclick", (e) => handleMapClick(e, map));
        mapRef.current = map;
    };

    const fetchAndDrawHives = async () => {
        const data = await fetchHives(apiUrl);
        setHives(data);
        drawHives(data);
    };

    const drawHives = (hivesList) => {
        if (!mapRef.current) return;
        if (vectorLayerRef.current) mapRef.current.removeLayer(vectorLayerRef.current);

        const vectorSource = new VectorSource();
        hivesList.forEach((hive) => {
            const feature = new Feature({ geometry: new Point(fromLonLat([hive.lon, hive.lat])) });
            feature.setId(hive.id);
            feature.setStyle(new Style({
                image: new Icon({ src: MARKER_ICON_URL, scale: 0.05 }),
                text: new Text({
                    text: hive.id.toString(),
                    fill: new Fill({ color: "#000" }),
                    stroke: new Stroke({ color: "#fff", width: 2 }),
                    offsetY: -20,
                }),
            }));
            feature.setProperties({ id: hive.id, lat: hive.lat, lon: hive.lon, type: "hive" });
            vectorSource.addFeature(feature);
        });

        const vectorLayer = new VectorLayer({ source: vectorSource });
        vectorLayerRef.current = vectorLayer;
        mapRef.current.addLayer(vectorLayer);
    };

    const fetchAndDrawInterferences = async () => {
        const data = await fetchInterferences(apiUrl);
        setInterferences(data);
        drawInterferences(data);
    };

    const drawInterferences = (list) => {
        if (!mapRef.current) return;
        if (mapRef.current.interferenceLayer) mapRef.current.removeLayer(mapRef.current.interferenceLayer);

        const source = new VectorSource();
        list.forEach((inter) => {
            const center = fromLonLat([inter.lon, inter.lat]);
            
            const circleFeature = new Feature({ geometry: new GeomCircle(center, inter.radiusMeters) });
            circleFeature.setProperties({ ...inter, type: "interference_area" });
            circleFeature.setStyle(new Style({
                fill: new Fill({ color: 'rgba(255, 0, 0, 0.2)' }),
                stroke: new Stroke({ color: 'red', width: 2 })
            }));

            const pointFeature = new Feature({ geometry: new Point(center) });
            pointFeature.setProperties({ ...inter, type: "interference" });
            pointFeature.setStyle(new Style({
                image: new Icon({
                    src: 'data:image/svg+xml;base64,' + btoa('<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="red" stroke="black"/></svg>'),
                    scale: 1
                })
            }));

            source.addFeature(circleFeature);
            source.addFeature(pointFeature);
        });

        const layer = new VectorLayer({ source });
        mapRef.current.interferenceLayer = layer;
        mapRef.current.addLayer(layer);
    };

    const handleMouseMove = (event, map) => {
        const coords = toLonLat(event.coordinate);
        setMouseCoords({ lat: coords[1].toFixed(6), lon: coords[0].toFixed(6) });
        
        const features = map.getFeaturesAtPixel(event.pixel);
        if (features.length > 0 && popoverRef.current) {
            const f = features[0];
            popoverRef.current.innerHTML = `ID: ${f.get("id")}<br>Lat: ${f.get("lat")}<br>Lon: ${f.get("lon")}`;
            popoverRef.current.style.left = `${event.pixel[0] + 10}px`;
            popoverRef.current.style.top = `${event.pixel[1] + 10}px`;
            popoverRef.current.style.display = "block";
        } else if (popoverRef.current) {
            popoverRef.current.style.display = "none";
        }
    };

    const handleMapClick = (event, map) => {
        const coords = toLonLat(event.coordinate);
        const features = map.getFeaturesAtPixel(event.pixel);
        const formattedCoords = { lat: coords[1].toFixed(6), lon: coords[0].toFixed(6) };

        if (features.length > 0 && (features[0].get("type") === "interference")) {
            setPopup({ visible: true, coords: formattedCoords, type: 'interference', interferenceId: features[0].get("id") });
        } else {
            setPopup({ visible: true, coords: formattedCoords, type: 'map' });
        }
    };

    if (!apiUrl) return <div style={{ textAlign: "center", marginTop: "50px" }}>Завантаження конфігурації...</div>;

    return (
        <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <h1>Hive Map</h1>
            <div style={{ marginBottom: "10px" }}>
                Lat: {mouseCoords.lat} | Lon: {mouseCoords.lon}
            </div>

            <div id="map-container" style={{ width: "90%", height: "70vh", border: "1px solid #ccc", position: "relative" }}></div>

            <div ref={popoverRef} style={{ position: "absolute", display: "none", background: "white", padding: "5px", border: "1px solid black", zIndex: 10, pointerEvents: "none" }}></div>

            <Popup 
                isVisible={popup.visible} 
                coords={popup.coords} 
                type={popup.type}
                interferenceId={popup.interferenceId}
                onConfirm={() => moveHives(apiUrl, popup.coords.lat, popup.coords.lon, hives.map(h => h.id))} 
                onPlaceInterference={(c) => { setPopup({visible:false}); setInterferenceRadiusModal({visible:true, coords:c}); }}
                onRemoveInterference={async (id) => { await deleteInterference(apiUrl, id); setPopup({visible:false}); await refreshData(); }}
                onCancel={() => setPopup({ visible: false })}
                onStopMove={() => stopHiveMove(apiUrl, hives.map(h => h.id))}
            />

            {interferenceRadiusModal.visible && (
                <div style={{ position: "fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:100 }}>
                    <div style={{ background:"white", padding:"20px", borderRadius:"8px" }}>
                        <h3>Set Radius (meters)</h3>
                        <input type="number" id="radiusInput" defaultValue="1000" />
                        <button onClick={() => {
                            const val = parseInt(document.getElementById('radiusInput').value);
                            handleInterferenceRadiusSubmit(val);
                        }}>OK</button>
                        <button onClick={() => setInterferenceRadiusModal({visible:false})}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapView;