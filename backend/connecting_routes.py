import requests
import csv

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
                'route_id': int(row['trip_id']) if row['mode'] == 'bus' else None,
                'mode': row['mode']
            }
            connections.append(conn)

            stops.add(row['dep_stop'])
            stops.add(row['arr_stop'])

    return list(stops), connections

# ghost bus + delay predictions using model
def get_prediction(route_id, departure):
    try:
        hour = departure // 100 # TODO uhh maybe change it to hrs+mins sinstead of just hrs

        url = f"http://127.0.0.1:5000/predict?route_id={route_id}&time={hour}"
        res = requests.get(url, timeout=2).json()

        return res["predicted_delay"], res["ghost_probability"]
    except:
        return 0, 0

# csa routing algoritnhm
def csa(start, end, start_time, stops, connections):
    # earliest arrival times
    earliest = {s: float('inf') for s in stops}
    earliest[start] = start_time

    prev = {s: None for s in stops}

    # order connections by departure time
    sorted_connections = connections.copy()
    for i in range(len(sorted_connections)):
        for j in range(i + 1, len(sorted_connections)):
            if sorted_connections[j]['departure'] < sorted_connections[i]['departure']:
                sorted_connections[i], sorted_connections[j] = sorted_connections[j], sorted_connections[i]

    # update earliest arrival times and prev
    for conn in sorted_connections:
        u = conn['from']
        v = conn['to']

        if earliest[u] <= conn['departure']:
            if conn['arrival'] < earliest[v]:
                earliest[v] = conn['arrival']
                prev[v] = conn

    route = []
    curr = end
    while curr != start:
        c = prev[curr]
        if c is None:
            break
        route.insert(0, c)
        curr = c['from']

    return route

stops, connections = load_connections("timing_data.csv")

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


# TODO instead of this take input from frontend
start_stop = 'Western Bank'
end_stop = 'Sheffield' # Charnok
start_time = 1520 # 1900

# calculate route using csa algorithm
main_route = csa(start_stop, end_stop, start_time, stops, connections)

# checking to see if there is a valid journey route
if main_route:
    print("Main route\n")
    leg_printer(main_route)
 
    # backup route  just in case
    # TODO if possible remove highest risk ghost bus instead of first connection
    backup_connections = connections.copy()
    backup_connections = [c for c in connections if c != main_route[0]]
    backup_route = csa(start_stop, end_stop, start_time, stops, backup_connections)
    # checking to see if there is a valid journey route
    if backup_route:
        print("Backup route\n")
        leg_printer(backup_route)
    else:
        print("No backup routes :(")
else:
    print("No possible routes :(")




