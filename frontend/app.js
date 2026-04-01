function getRoute() {
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;
    const timeInput = document.getElementById("time").value;

    if (!timeInput || isNaN(timeInput)) {
        alert("Enter a valid time like 1500 bestie");
        return;
    }

    const time = parseInt(timeInput);
    fetch(`http://127.0.0.1:5000/route?start=${start}&end=${end}&time=${time}`)
    .then(res => res.json())
    .then(data => {
        let text = "";

        if (data.status === "rerouted") {
            text += "Original route unreliable\n\n";
        }

        text += "MAIN ROUTE:\n";
        data.main_route.forEach(leg => {
            text += `${leg.from} → ${leg.to} (${leg.mode})\n`;
            text += `Delay: ${leg.delay} | Ghost Risk: ${(leg.ghost_risk * 100).toFixed(0)}%\n\n`;
        });

        if (data.backup_route && data.backup_route.length > 0) {
            text += "\n BETTER ROUTE:\n";
            data.backup_route.forEach(leg => {
                text += `${leg.from} → ${leg.to} (${leg.mode})\n`;
                text += `Delay: ${leg.delay} | Ghost Risk: ${(leg.ghost_risk * 100).toFixed(0)}%\n\n`;
            });
        }

        document.getElementById("output").innerText = text;
    });
}