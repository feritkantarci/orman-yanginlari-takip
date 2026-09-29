from database import SessionLocal
import models
from main import generate_excel_file
import openpyxl

db = SessionLocal()
output = generate_excel_file(db)
with open("test_out.xlsx", "wb") as f:
    f.write(output.read())
print("Excel saved to test_out.xlsx")
