from flask import Flask, request, jsonify
from flask_cors import CORS
from model import predict

app = Flask(__name__)
CORS(app)

@app.route("/predict")
def get_prediction():
    route_id = int(request.args.get("route_id"))
    time_of_day = int(request.args.get("time"))
    delay, ghost_prob = predict(route_id, time_of_day)
    return jsonify({
        "predicted_delay": round(delay, 2),
        "ghost_probability": round(ghost_prob, 2)

    })
if __name__ == "__main__":
    app.run(debug=True)