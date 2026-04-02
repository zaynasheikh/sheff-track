from flask import Flask, request, jsonify
import requests
from flask_cors import CORS
from model import predict

import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("API_KEY")

app = Flask(__name__)
CORS(app)

cached_zones = None

@app.route("/api/route", methods=["POST"])
def route():
    data = request.json
    mode = data.pop("mode", "foot-walking")

    res = requests.post(
        f"https://api.openrouteservice.org/v2/directions/{mode}",
        json=data,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json"
        }
    )

    return jsonify(res.json())

@app.route("/api/crowd")
def crowd():
    global cached_zones

    if cached_zones is not None:
        print("Using cached crowd zones")
        return jsonify(cached_zones)

    query = """
    [out:json][timeout:10];
    (
      node["railway"="station"](53.33,-1.55,53.42,-1.38);
      node["amenity"="bus_station"](53.33,-1.55,53.42,-1.38);
      node["shop"="supermarket"](53.33,-1.55,53.42,-1.38);
      node["amenity"="pub"](53.33,-1.55,53.42,-1.38);
      node["amenity"="restaurant"](53.33,-1.55,53.42,-1.38);
      node["amenity"="cafe"](53.33,-1.55,53.42,-1.38);
    );
    out;
    """

    servers = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]

    for server in servers:
        try:
            res = requests.post(
                server,
                data={"data": query},
                headers={"User-Agent": "SheffieldRouteApp/1.0"},
                timeout=15
            )
            print("Overpass status:", res.status_code, "from", server)

            if res.status_code != 200:
                continue

            data = res.json()
            elements = data.get("elements", [])

            if len(elements) == 0:
                continue

            zones = []
            for el in elements:
                tags = el.get("tags", {})
                if "lat" not in el or "lon" not in el:
                    continue

                level = 1
                if tags.get("railway") == "station" or tags.get("amenity") == "bus_station":
                    level = 4
                elif tags.get("shop") in ["supermarket", "mall"]:
                    level = 3
                elif tags.get("amenity") == "university":
                    level = 2.5
                elif tags.get("amenity") in ["pub", "restaurant"]:
                    level = 2
                elif tags.get("amenity") == "cafe":
                    level = 1.2

                zones.append({
                    "center": [el["lat"], el["lon"]],
                    "level": level,
                    "label": tags.get("name", "busy area")
                })

            cached_zones = zones
            print("Fetched and cached zones:", len(zones))
            return jsonify(zones)

        except Exception as e:
            print(f"Overpass error from {server}:", e)
            continue

    # Both servers failed, use fallback
    print("All Overpass servers failed, using fallback")
    fallback = [
        {"center": [53.3811, -1.4701], "level": 4, "label": "City Centre"},
        {"center": [53.3790, -1.4683], "level": 3, "label": "Fargate"},
        {"center": [53.3770, -1.4800], "level": 2, "label": "Sharrow"},
        {"center": [53.3650, -1.4900], "level": 1, "label": "Residential"}
    ]
    cached_zones = fallback
    return jsonify(fallback)

@app.route("/api/elevation", methods=["POST"])
def elevation():
    data = request.json
    url = "https://api.openrouteservice.org/elevation/line"

    res = requests.post(
        url,
        json=data,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json"
        }
    )

    print("Elevation ORS response:", res.status_code, res.text)
    return jsonify(res.json())

@app.route("/api/autocomplete")
def autocomplete():
    text = request.args.get("text")

    # Bounding box for Sheffield 
    bbox = [-1.55, 53.33, -1.38, 53.42]

    url = "https://api.openrouteservice.org/geocode/autocomplete"

    res = requests.get(
        url,
        params={
            "text": text,
            "size": 5,
            "boundary.rect.min_lon": bbox[0],
            "boundary.rect.min_lat": bbox[1],
            "boundary.rect.max_lon": bbox[2],
            "boundary.rect.max_lat": bbox[3]
        },
        headers={"Authorization": API_KEY}
    )

    return jsonify(res.json())

@app.route("/predict")
def get_prediction():
    route_id = int(request.args.get("route_id"))
    time_of_day = int(request.args.get("time"))
    delay, ghost_prob, gps_active_live = predict(route_id, time_of_day)
    return jsonify({
        "predicted_delay": round(delay, 2),
        "ghost_probability": round(ghost_prob, 2),
        "sensor_status": gps_active_live
    })
if __name__ == "__main__":
    app.run(debug=True)