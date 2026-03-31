import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

# load data
df = pd.read_csv("data.csv")

# fill missing actual_time for ghost buses
df["actual_time"] = df["actual_time"].fillna(df["scheduled_time"])

# create delay
df["delay"] = df["actual_time"] - df["scheduled_time"]

# ghost label
df["ghost"] = df["gps_active"] == 0

#features
X = df[["route_id", "time_of_day"]]

# model 1 for delay prediction
y_delay = df["delay"]
delay_model = RandomForestRegressor()
delay_model.fit(X, y_delay)

# model 2 ghost detection
y_ghost = df["ghost"]
ghost_model = RandomForestClassifier()
ghost_model.fit(X, y_ghost)

def predict(route_id, time_of_day):
    input_data = pd.DataFrame({
        "route_id": [route_id],
        "time_of_day": [time_of_day]
    })
    delay = delay_model.predict(input_data)[0]
    ghost_prob = ghost_model.predict_proba(input_data)[0][1]
    return delay, ghost_prob

def reliability_score():
    total = len(df)
    ghosts = df["ghost"].sum()
    return round((1 - ghosts/total) * 100, 2)