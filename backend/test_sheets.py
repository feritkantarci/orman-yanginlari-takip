import openpyxl
excel_path = 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx'
wb = openpyxl.load_workbook(excel_path)
print("Sheet names:", wb.sheetnames)
print("Active sheet:", wb.active.title)
