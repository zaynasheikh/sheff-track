from flask import Flask, request, jsonify
from flask_cors import CORS
from model import predict
from connecting_routes import find_best_route

app = Flask(__name__)
CORS(app)

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
@app.route("/route")
def get_route():
    start = request.args.get("start")
    end = request.args.get("end")
    time_str = request.args.get("time")

    if not time_str or not time_str.isdigit():
        return jsonify({"error": "Invalid or missing time"}), 400

    time = int(time_str)

    result = find_best_route(start, end, time)

    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)