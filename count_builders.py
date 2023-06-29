import pandas as pd
import json

# Load the Parquet file into a DataFrame
df = pd.read_parquet('eth_data.parquet.gzip')

# Define the start and end dates
start_date = pd.to_datetime('2023-05-19')
end_date = pd.to_datetime('2023-06-19')

# Filter the data between the start and end dates
filtered_df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]

# sort by date ascending
sorted_df = filtered_df.sort_values('date')

sorted_df['date'] = sorted_df['date'].dt.strftime('%Y-%m-%d')
sorted_df['builder'] = df['builder'].str.slice(0, 32)

grouped_df = sorted_df.groupby(['date', 'builder']).size().reset_index(name='count')

print(grouped_df)

data = {}

for index, row in grouped_df.iterrows():
    date_str = row['date'] # .strftime('%Y-%m-%d')
    builder = row['builder']
    count = row['count']

    if date_str not in data:
        data[date_str] = []

    data[date_str].append({'builder': builder, 'count': count})

# Save the dictionary as a JSON file
with open('output.json', 'w') as f:
    json.dump(data, f, indent=4)
