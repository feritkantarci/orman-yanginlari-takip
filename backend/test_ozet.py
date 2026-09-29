from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import main
import openpyxl

engine = create_engine('sqlite:///orman.db')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

output = main.generate_excel_file(db)
with open('test_ozet_output.xlsx', 'wb') as f:
    f.write(output.read())

wb = openpyxl.load_workbook('test_ozet_output.xlsx')
ws = wb.active
print(f"Created test_ozet_output.xlsx with {ws.max_row} rows!")
