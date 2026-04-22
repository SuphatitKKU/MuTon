import csv
import requests
from bs4 import BeautifulSoup
import re
import time
import json

BASE_URL = "http://mickyintercool.com"
TEMPLATE_CSV = r"d:\tools\wc-product-export-19-4-2026-1776594031539.csv"
OUTPUT_CSV = r"d:\tools\micky_scraper\woo_import_v2_json.csv"

BLOCKED_IMAGES = [
    "2a517d3fe41d6ddab9f8c59282a08940.jpg",
    "170ae0c36cbc0a960a0ac1c95b46eca7.jpg"
]

def map_brand(title):
    t = title.lower()
    if 'sanden' in t: return "Sanden Intercool / ซันเด้นอินเตอร์คลู"
    if 'the cool' in t: return "The Cool / เดอะคูล"
    if 'mirage' in t: return "Mirage / มิราจ"
    if 'patana' in t or 'pattana' in t: return "Patana Intercool / พัฒนาอินเตอร์คลู"
    if 'fresher' in t: return "Fresher / เฟรชเชอร์"
    if 'power cool' in t: return "Power Cool / พาวเวอร์คูล"
    if 'haier' in t: return "Haier / ไฮเออร์"
    if 'lucky star' in t: return "Lucky Star / ตู้แช่ลัคกี้สตาร์"
    if 'midea' in t: return "Midea / ไมเดีย"
    if 'atosa' in t: return "Atosa / เอโทซ่า"
    if 'kitco' in t: return "Kitco / คิทโค่"
    if 's-cool' in t or 'scool' in t: return "S-Cool / เอสคลู"
    if 'systemform' in t: return "Systemform / ซิสเต็มฟอร์ม"
    return "Micky Mart / มิคกี้มาร์ท"

CAT_MAP = {
    "ตู้แช่ 1 ประตู ขนาดเล็ก": "ตู้แช่เย็น 1 ประตู ขนาดเล็ก",
    "ตู้แช่ 1 ประตู": "ตู้แช่เย็น 1 ประตู",
    "ตู้แช่ 2 ประตู": "ตู้แช่เย็น 2 ประตู",
    "ตู้แช่ 3 ประตู": "ตู้แช่เย็น 3 ประตู",
    "ตู้แช่ 4 5 6 ประตู": "ตู้แช่เย็น 4 5 6 ประตู",
    "ตู้แช่เย็น และ แช่แข็ง สแตนเลส": "ตู้แช่เย็นสแตนเลส, ตู้แช่แข็งสแตนเลส",
    "ตู้แช่เคาน์เตอร์สแตนเลส (แช่เย็น)": "ตู้แช่เย็นเคาน์เตอร์สแตนเลส",
    "ตู้แช่เคาน์เตอร์สแตนเลส (แช่แข็ง)": "ตู้แช่แข็งเคาน์เตอร์สแตนเลส",
    "ตู้แช่แข็งฝาทึบ": "ตู้แช่แข็งฝาทึบ",
    "ตู้แช่แข็ง บานกระจก": "ตู้แช่แข็ง บานกระจก",
    "ตู้แช่ไอศรีม  ท็อปปิ้ง คานูปปี้": "ตู้แช่ไอศครีม ท็อปปิ้ง คานูปปี้",
    "ตู้แช่เบียร์วุ้น": "ตู้แช่เบียร์วุ้น",
    "ตู้เปิดหน้า โชว์สินค้า": "ตู้เปิดหน้า โชว์สินค้า",
    "ตู้โชว์เค้กเเละเบเกอรี่": "ตู้โชว์เค้กและเบเกอรี่",
    "ตู้โชว์เนื้อและตู้ซูซิ": "ตู้โชว์เนื้อและตู้ซูชิ",
    "ตู้ไวน์": "ตู้ไวน์",
    "ตู้แช่นมแม่": "ตู้แช่นมแม่",
    "ถังน้ำแข็งสแตนเลส": "ถังน้ำแข็งสแตนเลส",
    "อะไหล่เเละอุปกรณ์เสริมตู้เเช่": "อะไหล่และอุปกรณ์เสริมตู้แช่",
    "เครื่องทำน้ำหวานเกล็ดหิมะ/เครื่องจ่ายน้ำหวาน": "เครื่องทำน้ำหวานเกล็ดหิมะ / เครื่องจ่ายน้ำหวาน",
    "ตู้แช่วัคซีน": "ตู้แช่วัคซีน",
    "ตู้โชว์เค้กขนาดเล็ก": "ตู้โชว์เค้กขนาดเล็ก",
    "ตู้โชว์เค้กรุ่นประหยัด": "ตู้โชว์เค้กรุ่นประหยัด",
    "ตู้แช่เคาน์เตอร์สแตนเลสบานกระจก": "ตู้แช่เคาน์เตอร์สแตนเลสบานกระจก",
    "ตู้แช่เคาน์เตอร์สแตนเลสลิ้นชัก": "ตู้แช่เคาน์เตอร์สแตนเลสลิ้นชัก",
    "ตู้แช่แข็ง No frost ไม่มีน้ำแข็งเกาะ": "ตู้แช่แข็ง No Frost",
    "ตู้แช่แข็งฝาทึบ รุ่นประหยัด": "ตู้แช่แข็งฝาทึบ รุ่นประหยัด",
    "สินค้ามีตำหนิสภาพใหม่มาก": "สินค้าเกรด B ลดพิเศษ",
    "ค้นหาด้วยยี่ห้อ": ""
}


def scrape_table_data(soup):
    """Scrape the yellow spec table from the product detail page.
    Returns a list of {label, value} dicts and a highlight string."""
    table_rows = []
    highlight = ""
    
    # Find the table that contains "รายละเอียดสินค้า"
    tables = soup.find_all('table')
    
    for table in tables:
        rows = table.find_all('tr')
        for tr in rows:
            tds = tr.find_all('td')
            if len(tds) == 2:
                label = tds[0].get_text(strip=True).rstrip(' :').strip()
                value = tds[1].get_text(strip=True)
                
                # Skip header-like or empty rows
                if not label or not value:
                    continue
                if label == 'รายละเอียดสินค้า':
                    continue
                    
                table_rows.append({'label': label, 'value': value})
    
    # Remove duplicate rows (same label)
    seen = set()
    unique_rows = []
    for row in table_rows:
        key = row['label']
        if key not in seen:
            seen.add(key)
            unique_rows.append(row)
    
    # Generate highlight from table data
    highlights = []
    for row in unique_rows:
        l = row['label'].lower()
        v = row['value'].lower()
        combined = l + ' ' + v
        
        if 'inverter' in combined or 'อินเวอร์เตอร์' in combined:
            highlights.append("Inverter ประหยัดไฟเบอร์ 5 ⭐️⭐️⭐️⭐️⭐️")
        if 'no frost' in combined or 'ไม่มีน้ำแข็งเกาะ' in combined:
            highlights.append("ระบบ No Frost ไม่มีน้ำแข็งเกาะ")
        if '2 ระบบ' in combined or ('แช่เย็น' in combined and 'แช่แข็ง' in combined):
            highlights.append("ตู้แช่ 2 ระบบ สลับแช่เย็น/แช่แข็งได้")
    
    if not highlights:
        # Auto-generate from specs
        for row in unique_rows:
            if 'ลักษณะ' in row['label'] and row['value']:
                highlights.append(row['value'])
                break
    
    highlight = " | ".join(highlights) if highlights else ""
    
    return unique_rows, highlight

def get_product_highlight_from_text(desc, title):
    """Fallback highlight generator when no table data is available."""
    text = (str(desc) + " " + str(title)).lower()
    if 'inverter' in text or 'อินเวอร์เตอร์' in text:
        return "Inverter ประหยัดไฟเบอร์ 5 ⭐️⭐️⭐️⭐️⭐️"
    elif '2 ระบบ' in text or ('แช่เย็น' in text and 'แช่แข็ง' in text):
        return "ตู้แช่ 2 ระบบ สลับฟังก์ชันแช่เย็นหรือแช่แข็งได้ในตู้เดียว คุ้มค่า!"
    elif 'ฝาทึบ' in text:
        return "ตู้แช่แข็งฝาทึบ รักษาอุณหภูมิความเย็นคงที่ ช่วยถนอมอาหารได้ยาวนาน"
    elif 'กระจกสี่' in text or 'มินิมาร์ท' in text:
        return "ตู้แช่กระจกใสรอบด้าน โชว์สินค้าได้สวยงาม ดึงดูดสายตา"
    else:
        return ""

def main():
    print("=" * 60)
    print("WooCommerce Product Import Generator v2.0")
    print("พร้อมดึงตารางสเปก + จุดเด่นสินค้าครบ!")
    print("=" * 60)
    
    # Read template CSV for field names
    with open(TEMPLATE_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        original_fieldnames = list(reader.fieldnames)

    # Fix Meta : to Meta: 
    new_fieldnames = []
    for fn in original_fieldnames:
        if fn.startswith("Meta :"):
            new_fieldnames.append(fn.replace("Meta :", "Meta:"))
        else:
            new_fieldnames.append(fn)

    # Add the new _wc_product_table_data column if not present
    table_data_col = "Meta: _wc_product_table_data"
    if table_data_col not in new_fieldnames:
        new_fieldnames.append(table_data_col)

    # Scrape categories
    print("\nกำลังดึงหมวดหมู่ทั้งหมดจากเว็บเดิม...")
    try:
        res = requests.get(BASE_URL)
        soup = BeautifulSoup(res.content, 'html.parser')
        categories = []
        for a in soup.find_all('a', href=True):
            if '/product/category/' in a['href']:
                link = a['href']
                if link.startswith('/'): link = BASE_URL + link
                cat_name = a.text.strip()
                if cat_name in CAT_MAP and CAT_MAP[cat_name] != "":
                    categories.append((link, CAT_MAP[cat_name]))
                elif cat_name != "ค้นหาด้วยยี่ห้อ":
                    categories.append((link, cat_name))
    except Exception as e:
        print("เกิดข้อผิดพลาดในการดึงหมวดหมู่:", e)
        return

    categories = list(set(categories))
    scraped_data = {}

    # Scrape product list from each category
    for cat_url, mapped_cat_name in categories:
        print(f"  หมวด: {mapped_cat_name}")
        try:
            res = requests.get(cat_url)
            soup = BeautifulSoup(res.content, 'html.parser')
            for preview in soup.find_all('div', class_='product-preview'):
                title_tag = preview.find('h3')
                if not title_tag: continue
                raw_title = title_tag.text.strip()

                m_match = re.search(r'รุ่น\s*([A-Za-z0-9\-]+)', raw_title)
                model = m_match.group(1).strip() if m_match else raw_title[:30].strip()

                link_tag = preview.find('a', href=True)
                if not link_tag: continue
                prod_url = link_tag['href']
                if prod_url.startswith('/'): prod_url = BASE_URL + prod_url
                elif not prod_url.startswith('http'): prod_url = BASE_URL + '/' + prod_url

                if model in scraped_data:
                    if mapped_cat_name not in scraped_data[model]['categories']:
                        scraped_data[model]['categories'].append(mapped_cat_name)
                    continue

                price_match = re.search(r'(?:ราคา|Price)\s*([\d,]+)', raw_title)
                price = price_match.group(1).replace(',', '') if price_match else ""

                scraped_data[model] = {
                    'url': prod_url,
                    'raw_title': raw_title,
                    'model': model,
                    'price': price,
                    'categories': [mapped_cat_name]
                }
        except Exception as e:
            pass

    total = len(scraped_data)
    print(f"\nพบสินค้าทั้งหมด: {total} รุ่น")
    print("\nกำลังดึงรายละเอียดสเปกและรูปภาพจากหน้าสินค้าแต่ละตัว...")

    count = 0
    for model, info in scraped_data.items():
        count += 1
        if count % 20 == 0:
            print(f"  ดำเนินการ {count}/{total} ({count*100//total}%)...")
        
        try:
            res = requests.get(info['url'])
            soup = BeautifulSoup(res.content, 'html.parser')

            # Scrape images
            images = []
            for img in soup.find_all('img', src=True):
                src = img['src']
                if 'user_images' in src:
                    skip = False
                    for b in BLOCKED_IMAGES:
                        if b in src:
                            skip = True
                            break
                    if skip: continue
                    if src.startswith('/'): src = BASE_URL + src
                    elif not src.startswith('http'): src = BASE_URL + '/' + src
                    if src not in images: images.append(src)

            info['images'] = ", ".join(images)

            # Scrape table data (the yellow spec table!)
            table_rows, highlight = scrape_table_data(soup)
            info['table_data'] = table_rows
            info['highlight_from_table'] = highlight

            # Get short description and description from text
            desc_texts = []
            short_desc = ""
            for tag in soup.find_all(['p', 'span', 'li', 'div', 'td']):
                txt = tag.text.strip().replace('\n', ' ')
                if not txt: continue
                if re.search(r'(ก\.|กว้าง|W).*?(ล\.|ลึก|D).*?(ส\.|สูง|H)', txt) or re.search(r'\d+\s*x\s*\d+\s*x\s*\d+', txt):
                    if len(txt) < 100: short_desc = txt
                if ('ลิตร' in txt or 'คิว' in txt or 'ความจุ' in txt) and len(txt) < 150:
                    if txt not in desc_texts: desc_texts.append(txt)

            info['short_desc'] = short_desc
            info['desc'] = " ".join(desc_texts) if desc_texts else ""
            info['brand'] = map_brand(info['raw_title'])

            time.sleep(0.05)
        except Exception as e:
            info['table_data'] = []
            info['highlight_from_table'] = ""
            info['short_desc'] = ""
            info['desc'] = ""
            info['brand'] = map_brand(info.get('raw_title', ''))
            info['images'] = ""

    # Build CSV rows
    print(f"\nสร้างไฟล์ CSV สำหรับ Import...")
    final_rows = []
    empty_row = {fn: "" for fn in new_fieldnames}
    
    table_count = 0
    highlight_count = 0

    for sku, data in scraped_data.items():
        new_row = empty_row.copy()

        new_row['ชนิด'] = 'simple'
        new_row['รหัสสินค้า'] = sku

        brand_short = data['brand'].split(' / ')[0].upper()
        if brand_short == "MICKY MART": brand_short = "แบรนด์ทั่วไป"

        new_row['ชื่อ'] = f"ยี่ห้อ {brand_short} รุ่น {sku}"
        new_row['เผยแพร่แล้ว'] = '1'
        new_row['การมองเห็นในแค็ตตาล็อก'] = 'visible'
        new_row['สถานะภาษี'] = 'taxable'
        new_row['มีสินค้าในคลังสินค้า?'] = '1'
        new_row['เปิดให้ผู้ใช้รีวิวสินค้า?'] = '1'
        new_row['ราคาปกติ'] = data['price']
        new_row['คำอธิบายแบบย่อ'] = data['short_desc']
        new_row['คำอธิบาย'] = data['desc']
        new_row['หมวดหมู่'] = ", ".join(data['categories'])
        new_row['ไฟล์รูปภาพ'] = data.get('images', '')
        new_row['แบรนด์'] = data['brand']

        # Meta fields
        new_row['Meta: _klb_product_percentage_check'] = 'style-1'
        new_row['Meta: _klb_product_badge_type'] = 'style-1'
        new_row['Meta: _wc_product_table_show'] = 'yes'
        new_row['Meta: _wc_product_table_title'] = 'รายละเอียดสินค้า'

        # Table data - serialize as JSON for WordPress (our plugin hook will convert this)
        table_data = data.get('table_data', [])
        if table_data:
            # Store as simple JSON list of dicts: [{"label":"...","value":"..."}, ...]
            new_row[table_data_col] = json.dumps(table_data, ensure_ascii=False)
            table_count += 1

        # Product highlights
        highlight = data.get('highlight_from_table', '')
        if not highlight:
            highlight = get_product_highlight_from_text(data['desc'], data['raw_title'])
        if highlight:
            new_row['Meta: _product_highlights'] = highlight
            highlight_count += 1

        final_rows.append(new_row)

    # Write CSV
    with open(OUTPUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(final_rows)

    print(f"\n{'=' * 60}")
    print(f"✅ เสร็จสมบูรณ์!")
    print(f"   สินค้าทั้งหมด: {len(final_rows)} รุ่น")
    print(f"   มีตารางสเปก: {table_count} สินค้า")
    print(f"   มีจุดเด่น: {highlight_count} สินค้า")
    print(f"   ไฟล์: {OUTPUT_CSV}")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
