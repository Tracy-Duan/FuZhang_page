"""Extract bounded document text. PDF needs pypdf; DOCX uses the standard library."""
import base64
import io
import json
import sys
import zipfile
from xml.etree import ElementTree

MAX_TEXT = 16000

def extract(payload):
    data = base64.b64decode(payload['base64'], validate=True)
    if len(data) > 5 * 1024 * 1024:
        raise ValueError('单个文件不能超过 5MB')
    extension = payload['extension']
    if extension == 'pdf':
        from pypdf import PdfReader
        if not data.startswith(b'%PDF-'):
            raise ValueError('文件不是有效的 PDF')
        with io.BytesIO(data) as stream:
            document = PdfReader(stream)
            if document.is_encrypted:
                raise ValueError('请先移除 PDF 密码后再上传')
            if len(document.pages) > 100:
                raise ValueError('PDF 最多支持 100 页，请拆分后上传')
            pages = []
            for page in document.pages:
                text = (page.extract_text() or '').strip()
                if not text:
                    raise ValueError('PDF 含扫描或无可提取文字的页面，暂不支持 OCR；请提供文本型 PDF')
                pages.append(text)
                if sum(map(len, pages)) > MAX_TEXT:
                    raise ValueError('文件文字超过 16000 字符，请拆分后上传')
            text = '\n\n'.join(pages)
    elif extension == 'docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo('word/document.xml')
            if info.file_size > 2 * 1024 * 1024:
                raise ValueError('Word 文档正文过大，请拆分后上传')
            tree = ElementTree.fromstring(archive.read(info))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = '\n'.join(''.join(node.text or '' for node in paragraph.findall('.//w:t', ns)) for paragraph in tree.findall('.//w:p', ns))
    else:
        raise ValueError('仅支持文本型 PDF 和 DOCX')
    if not text.strip():
        raise ValueError('文件没有可读取的正文；暂不支持扫描件、图片型文档或旧版 DOC')
    if len(text) > MAX_TEXT:
        raise ValueError('文件文字超过 16000 字符，请拆分后上传')
    return text.strip()

try:
    result = {'text': extract(json.load(sys.stdin))}
except ImportError:
    result = {'error': '服务端 PDF 解析依赖未就绪，请安装 pypdf 或使用 TXT 文件'}
except (ValueError, KeyError) as error:
    result = {'error': str(error)}
except Exception:
    result = {'error': '文件无法解析，请确认文件未损坏，且是文本型 PDF 或 DOCX'}
sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
