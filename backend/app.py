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

@app.route("/api/route", methods=["POST"])
def route():
    data = request.json

    res = requests.post(
        "https://api.openrouteservice.org/v2/directions/foot-walking",
        json=data,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json"
        }
    )

    return jsonify(res.json())

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

    return jsonify(res.json())

@app.route("/api/autocomplete")
def autocomplete():
    text = request.args.get("text")

    # Bounding box for Sheffield (min_lon, min_lat, max_lon, max_lat)
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