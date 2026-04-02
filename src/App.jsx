import { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
  ZoomControl
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import polyline from '@mapbox/polyline';

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const bounds = [[53.33, -1.55],[53.42, -1.38] ];

async function fetchCrowdZones() {
  try {
    const res = await fetch("/api/crowd");

    if (!res.ok) {
      console.error("Crowd API failed");
      return [];
    }

    const data = await res.json();
    console.log("Elevation response:", JSON.stringify(data));
    return Array.isArray(data) ? data : [];

  } catch (e) {
    console.error("Fetch error:", e);
    return [];
  }
}

function FlyToRoute({ start }) {
  const map = useMap();
  if (start) map.setView(start, 14);
  return null;
}

const stopCoordsLookup = {
  // Original Hubs
  "Western Bank": [53.3814, -1.4884],
  "City Centre": [53.3806, -1.4702],
  "Sheffield": [53.3777, -1.4616],
  "University Tram Stop": [53.3813, -1.4860],
  
  // New Local Areas
  "Hillsborough": [53.4011, -1.5005],
  "Meadowhall": [53.4139, -1.4111],
  "Ecclesall Road": [53.3665, -1.4945],
  "Manor Top": [53.3635, -1.4235],
  "Darnall": [53.3845, -1.4132],
  "Crookes": [53.3835, -1.5032],
  "Broomhill": [53.3768, -1.4948],
  "Charnok": [53.3444, -1.4185],
  "Woodhouse": [53.3557, -1.3739],
  
  // Train Destinations
  "Leeds": [53.7951, -1.5476],
  "Birmingham New Street": [52.4777, -1.8990],
  "London Euston": [51.5284, -0.1332],
  "Bristol Temple Meads": [51.4496, -2.5810]
};
export default function App() {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [routeSelected, setRouteSelected] = useState([]);
  const [priority, setPriority] = useState("balanced");
  const [routeInfo, setRouteInfo] = useState('');
  const [warning, setWarning] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("foot-walking");
  const [hillScores, setHillScores] = useState([]);
  const [crowdZones, setCrowdZones] = useState([]);

  useEffect(() => {
    fetchCrowdZones().then(zones => {
      console.log("Loaded crowd zones:", zones?.length);
      setCrowdZones(zones);
    });
  }, []);
  
  const [transportData, setTransportData] = useState(null);
  const [timeInput, setTimeInput] = useState("1500");
  const [showTransport, setShowTransport] = useState(false);

  const getTransportPath = () => {
  if (!transportData || !transportData.main_route) return [];
  
  const path = [];

  transportData.main_route.forEach((leg, index) => {
    const fromCoord = stopCoordsLookup[leg.from];
    const toCoord = stopCoordsLookup[leg.to];

    if (fromCoord) path.push(fromCoord);

    // only push last destination once
    if (toCoord && index === transportData.main_route.length - 1) {
      path.push(toCoord);
    }
  });

  return path;
};
  // Scoring
  function calculateDistance(coords) {
    let dist = 0;
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i][0] - coords[i - 1][0];
      const dy = coords[i][1] - coords[i - 1][1];
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    return dist * 111000;
  }

  function calculateCrowdScore(coords) {
    let score = 0;

    coords.forEach(([lat, lng]) => {
      let nearby = 0;

      crowdZones.forEach(zone => {
        const dx = lat - zone.center[0];
        const dy = lng - zone.center[1];
        if (Math.sqrt(dx * dx + dy * dy) < 0.005) {
          nearby += zone.level;
        }
      });

      score += nearby;
    });
    
    return score;
  }

  function isNearRoute(zone, route) {
    return route.some(([lat, lng]) => {
      const dx = lat - zone.center[0];
      const dy = lng - zone.center[1];
      return Math.sqrt(dx * dx + dy * dy) < 0.003; 
    });
  }

  function mergeZones(zones) {
    const merged = [];

    zones.forEach(zone => {
      let found = false;

      for (let m of merged) {
        const dx = zone.center[0] - m.center[0];
        const dy = zone.center[1] - m.center[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.003 && Math.abs(m.level - zone.level) < 1){ // merge distance
          // merge into existing cluster
          m.center[0] = (m.center[0] + zone.center[0]) / 2;
          m.center[1] = (m.center[1] + zone.center[1]) / 2;
          m.level = Math.max(m.level, zone.level);
          m.count += 1;
          found = true;
          break;
        }
      }

      if (!found) {
        merged.push({ ...zone, count: 1 });
      }
    });

    return merged;
  }

  function removeOverlaps(zones) {
    const result = [];

    zones.forEach((zone) => {
      const tooClose = result.some((existing) => {
        const dx = zone.center[0] - existing.center[0];
        const dy = zone.center[1] - existing.center[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist < 0.002; // simple fixed distance
      });

      if (!tooClose) {
        result.push(zone);
      }
    });

    return result;
  }

  async function fetchElevationScore(coords) {
    try {
      // Sample max 20 points
      const sampled = coords.filter((_, i) =>
        i % Math.ceil(coords.length / 20) === 0
      );

      const res = await fetch("/api/elevation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          format_in: "geojson",
          format_out: "geojson",
          geometry: {
            coordinates: sampled.map(([lat, lng]) => [lng, lat]),
            type: "LineString"
          }
        })
      });
            
      const data = await res.json();
      console.log("Elevation response:", data);
      const elevations = data.geometry.coordinates.map(c => c[2]);

      let totalClimb = 0;
      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) totalClimb += diff; // only count uphill metres
      }

      return totalClimb;

    } catch (e) {
      console.warn("Elevation fetch failed, using fallback:", e);
      return null; 
    }
  }

  function calculateRouteScore(coords, currentPriority, realHillScore) {
    const d = calculateDistance(coords);
    const c = calculateCrowdScore(coords);

    if (currentPriority === "fast")  return d;
    if (currentPriority === "crowd") return c * 1000 + d;
    if (currentPriority === "safe")  return -c * 1000 + d;

    // If no real hill score is available, use distance and crowd
    if (realHillScore === null || realHillScore === undefined) {
      if (currentPriority === "hills") return d; // fall back to shortest
      return d + c * 200; 
    }

    const h = realHillScore;
    if (currentPriority === "hills") return h * 1000 + d;
    return d + c * 200 + h * 500;
  }

  function pickBestRoute(routes, currentPriority, hillScores) {
    let bestRoute = routes[0];
    let bestScore = calculateRouteScore(routes[0], currentPriority, hillScores[0]);

    routes.forEach((coords, i) => {
      const score = calculateRouteScore(coords, currentPriority, hillScores[i]);
      if (score < bestScore) {
        bestScore = score;
        bestRoute = coords;
      }
    });

    return bestRoute;
  }

  const currentModeRef = useRef(mode);
  function updateRouteInfo(route, currentMode, currentPriority) {
    const distanceMetres = calculateDistance(route);
    const speed = currentMode === "cycling-regular" ? 4.2 : 1.4;
    const time = Math.round(distanceMetres / speed / 60);
    const distanceKm = (distanceMetres / 1000).toFixed(1);
    const routeIndex = allRoutes.findIndex(r => r === route);
    const climbMetres = hillScores[routeIndex];
    const climbText = climbMetres != null ? ` | ↑${Math.round(climbMetres)}m` : '';
    setRouteInfo(`Route ${routeIndex + 1} of ${allRoutes.length} (${currentPriority}): ~${time} min | ${distanceKm} km${climbText}`);
    const diff = Math.abs(route[0][0] - route[route.length - 1][0]) * 111000;
    setWarning(diff > 50 ? "Steep route" : "");
  }

  async function fetchRoutes(startCoords, endCoords, currentMode, signal) {
    setLoading(true);
    setRouteInfo('');
    setWarning('');

    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          coordinates: [
            [startCoords.lng, startCoords.lat],
            [endCoords.lng, endCoords.lat]
          ],
          mode: currentMode, 
          alternative_routes: {
            target_count: 3,
            weight_factor: 1.6
          },
          geometry: true,
          geometry_simplify: false
        })
      });

      // If aborted, don't update state
      if (signal?.aborted) return;

      const data = await res.json();
      console.log("fetchRoutes called with mode:", currentMode);

      const rawRoutes = data.routes ?? data.features;

      if (!rawRoutes || rawRoutes.length === 0) {
        alert("No routes found between these points");
        setLoading(false);
        return;
      }

      const parsed = rawRoutes.map(r => polyline.decode(r.geometry));

      if (currentModeRef.current !== currentMode) {
        setLoading(false);
        return;
      }

      // Fetch elevation for all routes in parallel
      const elevationScores = await Promise.all(
        parsed.map(coords => fetchElevationScore(coords))
      );
      console.log("Elevation scores (metres climb):", elevationScores);

      setAllRoutes(parsed);
      setHillScores(elevationScores);
      const best = pickBestRoute(parsed, priority, elevationScores);
      setRouteSelected(best);
      updateRouteInfo(best, currentMode, priority);

      console.log("currentModeRef.current:", currentModeRef.current);
      console.log("currentMode:", currentMode);

      if (currentModeRef.current !== currentMode) {
        console.log("Ignoring stale result for", currentMode);
        setLoading(false);
        return;
      }

      console.log(`Got ${parsed.length} routes from ORS`);
      console.log("parsed routes count:", parsed.length);
      console.log("first route sample:", parsed[0]?.slice(0, 3));
      console.log("best route sample:", best?.slice(0, 3));
      setRouteSelected(best);
      updateRouteInfo(best, currentMode, priority);

            if (signal?.aborted) return; // check again after async work

    } catch (e) {
      if (e.name === 'AbortError') return; // ignore aborted requests
      console.error("Route fetch error:", e);
      alert("Could not fetch route — check console");
    }

    setLoading(false);
  }
  async function fetchTransportRoute() {
    if (!startInput || !endInput) return;
    setLoading(true);
    try {
      // ADD THIS: Look up coordinates for the pins
      const startCoord = stopCoordsLookup[startInput];
      const endCoord = stopCoordsLookup[endInput];

      if (startCoord) setStart({ lat: startCoord[0], lng: startCoord[1] });
      if (endCoord) setEnd({ lat: endCoord[0], lng: endCoord[1] });

      // Calling your specific Python CSA backend
      const res = await fetch(`http://127.0.0.1:5000/route?start=${startInput}&end=${endInput}&time=${timeInput}`);
      const data = await res.json();
      setTransportData(data);
      setShowTransport(true);
    } catch (e) {
      console.error("Transport fetch error", e);
    }
    setLoading(false);
  }

  useEffect(() => {
    currentModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!start || !end) return;

    //  STOP walking API when in transport mode
    if (mode === "transport") return;
    const requestedMode = mode;

    setAllRoutes([]);
    setRouteSelected([]);
    setRouteInfo('');
    setHillScores([]);

    async function run() {
      await fetchRoutes(start, end, requestedMode);
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, mode]);

  useEffect(() => {
    if (allRoutes.length === 0 || hillScores.length !== allRoutes.length) return;

    const best = pickBestRoute(allRoutes, priority, hillScores);
    setRouteSelected(best);
    updateRouteInfo(best, mode, priority);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priority, allRoutes, hillScores]);

  

  // Autocomplete
  const debounceTimer = useRef(null);
  async function fetchSuggestions(query, setSuggestions) {
    if (query.length < 3) return setSuggestions([]);
    clearTimeout(debounceTimer.current);

    // eslint-disable-next-line react-hooks/immutability
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?text=${encodeURIComponent(query)}`)
        const data = await res.json();

        // ORS geocode 
        const suggestions = data.features.map(f => ({
          display_name: f.properties.label,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0]
        }));

        setSuggestions(suggestions);
      } catch (e) {
        console.log("Autocomplete error", e);
      }
    }, 400);
  }

  const filteredZones = Array.isArray(crowdZones)
    ? crowdZones
        .filter(z => z.level >= 0.5)
        .filter(z => isNearRoute(z, routeSelected))
    : [];

  const boostedZones = mergeZones(filteredZones).map(z => ({
    ...z,
    level: Math.min(4, z.level + Math.floor(z.count / 5) * 0.5)
  }));

  const mergedZones = removeOverlaps(boostedZones)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  console.log("mergedZones:", mergedZones.map(z => ({ label: z.label, level: z.level, count: z.count })));

  return (
    <div>
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'white',
        padding: '12px',
        borderRadius: '10px',
        width: '280px'
      }}>
        <h3>Smart Route Planner</h3>

        <input placeholder="Start" value={startInput}
          onChange={(e) => {
            const val = e.target.value;
            setStartInput(val);

            if (mode !== "transport") {
              fetchSuggestions(val, setStartSuggestions);
            } else {
              setStartSuggestions([]);

              if (stopCoordsLookup[val]) {
                setStart({
                  lat: stopCoordsLookup[val][0],
                  lng: stopCoordsLookup[val][1]
                });
              }
            }
          }} />
        {mode !== "transport" && startSuggestions.map((s, i) => (
          <div key={i}
            style={{ cursor: 'pointer', padding: '4px', borderBottom: '1px solid #eee' }}
            onClick={() => {
              setStartInput(s.display_name);
              setStart({ lat: +s.lat, lng: +s.lon });
              setStartSuggestions([]);
            }}>{s.display_name}</div>
        ))}

        <input placeholder="End" value={endInput}
          onChange={(e) => {
            const val = e.target.value;
            setEndInput(val);

            if (mode !== "transport") {
              fetchSuggestions(val, setEndSuggestions);
            } else {
              setEndSuggestions([]);

              //  SAME FIX HERE
              if (stopCoordsLookup[val]) {
                setEnd({
                  lat: stopCoordsLookup[val][0],
                  lng: stopCoordsLookup[val][1]
                });
              }
            }
          }} />
        {mode !== "transport" && endSuggestions.map((s, i) => (
          <div key={i}
            style={{ cursor: 'pointer', padding: '4px', borderBottom: '1px solid #eee' }}
            onClick={() => {
              setEndInput(s.display_name);
              setEnd({ lat: +s.lat, lng: +s.lon });
              setEndSuggestions([]);
            }}>{s.display_name}</div>
        ))}

        <select value={mode} onChange={(e) => {
          setMode(e.target.value);
          setShowTransport(false);
        }}>
          <option value="foot-walking">Walking</option>
          <option value="cycling-regular">Cycling</option>
          <option value="transport">Bus / Tram / Train (Smart)</option>
        </select>

        {mode !== "transport" && (
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="balanced">Balanced</option>
            <option value="fast">Fastest</option>
            <option value="hills">Less Hilly</option>
            <option value="crowd">Less Crowded</option>
            <option value="safe">Safe (Night)</option>
          </select>
        )}
        {mode === "transport" && (
          <div style={{ marginTop: '10px' }}>
            <input
              placeholder="Time (e.g. 1500)"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              style={{ width: '100px' }}
            />
            <button onClick={fetchTransportRoute} style={{ marginLeft: '10px' }}>
              Find Smart Route
            </button>
          </div>
        )}

        <hr />

        {/*  TRANSPORT RESULT BOX */}
        {mode === "transport" && transportData && (
          <div style={{ 
            marginTop: '10px',
            padding: '10px',
            background: '#f0f7ff',
            borderRadius: '8px',
            fontSize: '13px',
            border: '1px solid #007bff'
          }}>
            <h4>Smart Transport Results</h4>

            {transportData.status === "rerouted" && (
              <p style={{ color: 'orange' }}>
                ⚠️ Rerouted due to Ghost Risk!
              </p>
            )}

            {transportData.main_route?.map((leg, i) => (
              <div key={i} style={{ marginBottom: '8px' }}>
                <b>{leg.from} → {leg.to}</b>
                <div>{leg.mode}</div>
                <div>
                  Ghost Risk: {(leg.ghost_risk * 100).toFixed(0)}% | Delay: {leg.delay}
                </div>
              </div>
            ))}
          </div>
        )}

        {/*  NORMAL MODE UI */}
        {mode !== "transport" && (
          <>
            {loading && <p>Finding routes...</p>}
            {warning && <p style={{ color: 'red' }}>{warning}</p>}
            {routeInfo && <p>{routeInfo}</p>}

            <p><b>Legend:</b></p>
            <p style={{ color: 'red' }}>Busy</p>
            <p style={{ color: 'orange' }}>Medium</p>
            <p style={{ color: 'green' }}>Quiet</p>
          </>
        )}
      </div>

      <MapContainer
        center={[53.3811, -1.4701]}
        zoom={13}
        zoomControl={false}
        minZoom={12}
        maxZoom={18}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ height: '100vh' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ZoomControl position="topright" />
        <FlyToRoute start={start} />

        {start && <Marker position={start}><Popup>Start</Popup></Marker>}
        {end && <Marker position={end}><Popup>End</Popup></Marker>}

        {/*  Walking/Cycling */}
        {mode !== "transport" && routeSelected.length > 0 && (
          <Polyline 
            positions={routeSelected} 
            pathOptions={{ color: 'green', weight: 6 }} 
          />
        )}

        {/* Transport */}
        {mode === "transport" && transportData && (
          <Polyline 
            positions={getTransportPath()} 
            pathOptions={{ 
              color: transportData.status === "rerouted" ? "orange" : "blue",
              weight: 6,
              dashArray: '10, 10'
            }} 
          />
        )}

        {mergedZones.map((z, i) => {
          let color;

          if (z.level >= 3) {
            color = '#ff4d4d';  
          } else if (z.level >= 1.5) {
            color = '#ffa94d';
          } else {
            color = '#66cc66';
          }

          return (
            <Circle
              key={i}
              center={z.center}
              radius={z.count > 1 ? 80 + z.count * 15 : 60}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.25
              }}
            >
              <Popup>
                {z.count} crowded places
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
}