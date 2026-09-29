from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import main

engine = create_engine('sqlite:///backend/orman.db')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

output = main.generate_excel_file(db)
with open('test_ozet_output.xlsx', 'wb') as f:
    f.write(output.read())

print("Created test_ozet_output.xlsx")
