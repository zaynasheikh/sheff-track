function getData() {
    fetch("http://127.0.0.1:5000/predict?route_id=52&time=8")
    .then(res => res.json())
    .then(data => {
        document.getElementById("output").innerText =
          "Delay: " + data.predicted_delay +
          " mins | Ghost Risk: " + data.ghost_probability;
    });
}