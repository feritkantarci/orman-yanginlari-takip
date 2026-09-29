import openpyxl
import os

excel_path = 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx'
wb = openpyxl.load_workbook(excel_path)
ws = wb.active

for row in range(4, 10):
    cell = ws.cell(row=row, column=1)
    print(f"Row {row}: value='{cell.value}', type={type(cell.value)}, str='{str(cell.value).strip()}'")
