import requests
import json

# Test face matching against nikhil2 album
ML_API_BASE_URL = "https://face-recognition-ml-912427501420.us-central1.run.app/"

image_path = "E:/Face app test/Nikhil weds Muskaan-20251219T080144Z-3-004/Nikhil weds Muskaan/DAY 1 PATHBITHAI PHOTOS 05-12-2025/1S2A0272.JPG"
embedding_file = "admin-nikhil2_embeddings.json"

with open(image_path, 'rb') as f:
    files = {'file': ('test.jpg', f, 'image/jpeg')}
    data = {'embedding_file': embedding_file, 'threshold': '0.55'}
    
    response = requests.post(
        f"{ML_API_BASE_URL}find_similar_faces/",
        files=files,
        data=data,
        timeout=60
    )

result = response.json()
print(f"Status: {response.status_code}")
print(f"Match count: {result.get('match_count', 0)}")
print(f"Matches:")
for match in result.get('matches', []):
    print(f"  - {match.get('url', 'N/A')[-40:]} (score: {match.get('score', 0):.3f})")
