import requests
import csv
from model import predict

# loading connections from given csv file
def load_connections(file):
    connections = []
    stops = set()

    with open(file, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            conn = {
                'from': row['dep_stop'],
                'to': row['arr_stop'],
                'departure': int(row['dep_time']),
                'arrival': int(row['arr_time']),
                'route_id': row['trip_id'], # KEEP it as the raw ID (T1, EMR, 52)
                'mode': row['mode']
            }
            connections.append(conn)

            stops.add(row['dep_stop'])
            stops.add(row['arr_stop'])

    return list(stops), connections

# ghost bus + delay predictions using model
def get_prediction(route_id, departure):
    try:
        # If it's already a number (like 52), use it. 
        # If it's a string (like 'T1'), hash it to a consistent number.
        try:
            rid = int(route_id)
        except:
            rid = sum(ord(c) for c in str(route_id))
        
        hour = int(departure) // 100
        # Call the model
        delay, ghost, _ = predict(rid, hour)
        return delay, ghost
    except Exception as e:
        print(f"Prediction error: {e}")
        return 0, 0

# csa routing algoritnhm
def csa(start, end, start_time, stops, connections):
    earliest_time = {s: float('inf') for s in stops}
    earliest_cost = {s: float('inf') for s in stops}
    earliest_time[start] = start_time
    earliest_cost[start] = start_time
    
    prev = {s: None for s in stops}
    sorted_connections = sorted(connections, key=lambda x: x['departure'])

    for conn in sorted_connections:
        u = conn['from']
        v = conn['to']
        
        if earliest_time[u] <= conn['departure']:
            # CHANGE: Now we get predictions for EVERYTHING (Bus, Tram, and Train)
            # We use trip_id as the route_id for the model
            delay, ghost = get_prediction(conn['route_id'], conn['departure'])
            
            # The "Smart Cost" calculation
            # If ghost risk is high, penalty is huge. 
            # If delay is high, cost goes up.
            risk_penalty = ghost * 500 
            current_leg_cost = conn['arrival'] + delay + risk_penalty
            
            if current_leg_cost < earliest_cost[v]:
                earliest_cost[v] = current_leg_cost
                earliest_time[v] = conn['arrival'] + delay 
                prev[v] = conn

    route = []
    curr = end
    while curr in prev and prev[curr] is not None:
        c = prev[curr]
        route.insert(0, c)
        curr = c['from']
    return route

# printing info for each leg TODO will change this for frontend bc shouldnt be printing to terminal
def leg_printer(route):
    for leg in route:
        # use model for buses only
        if leg['mode'] == 'bus':
            delay, ghost = get_prediction(leg['route_id'], leg['departure'])
        else:
            delay, ghost = 0, 0

        leg['delay'] = delay
        leg['ghost_risk'] = ghost
        leg['adjusted_arrival'] = leg['arrival'] + delay

        print(f"{leg['departure']} -> {leg['arrival']} : {leg['from']} -> {leg['to']} ({leg['mode']}, {leg['route_id']})")
        print(f"Ghost risk: {leg['ghost_risk']}")
        print(f"Delay: {leg['delay']}\n")
        #print(f"Adjusted arrival: {leg['adjusted_arrival']}")

def is_bad_route(route):
    total_ghost = sum([leg.get('ghost_risk', 0) for leg in route])
    return total_ghost > 1.0  #threshold

def find_best_route(start_stop, end_stop, start_time):
    stops, connections = load_connections("timing_data.csv")

    main_route = csa(start_stop, end_stop, start_time, stops, connections)

    def format_route(route):
        output = []
        for leg in route:
            delay, ghost = get_prediction(leg['route_id'], leg['departure'])
            adjusted_arrival = leg['arrival'] + delay
            output.append({
                "from": leg['from'],
                "to": leg['to'],
                "departure": leg['departure'],
                "arrival": leg['arrival'],
                "mode": leg['mode'],
                "delay": round(delay, 1),
                "ghost_risk": ghost,
                "adjusted_arrival": adjusted_arrival
            })
        return output

    if not main_route:
        return {"error": "No route found"}

    # check if bad
    total_ghost = sum([leg.get('ghost_risk', 0) for leg in main_route])
    avg_ghost = total_ghost / len(main_route)
    if avg_ghost > 0.4:
        # remove risky buses
        filtered_connections = []
        for c in connections:
            if c['mode'] == 'bus':
                _, ghost = get_prediction(c['route_id'], c['departure'])
                if ghost > 0.7:
                    continue
            filtered_connections.append(c)

        backup_route = csa(start_stop, end_stop, start_time, stops, filtered_connections)

        return {
            "status": "rerouted",
            "main_route": format_route(main_route),
            "backup_route": format_route(backup_route) if backup_route else []
        }

    return {
        "status": "ok",
        "main_route": format_route(main_route)
    }

