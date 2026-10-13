#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
====================================================================
      ROBÔ PYTHON WHATSAPP - CHECKLIST TRUCK PRO
====================================================================
Script em Python utilizando Playwright para automação do WhatsApp Web:
- Envia Fotos e Vídeos de vistoria com o Relatório/Legenda em anexo
- Mantém a sessão salva (QR Code escaneado apenas na 1ª vez)
- Lê pacotes JSON exportados diretamente do app Checklist Truck Pro
- Permite uso via Linha de Comando (CLI), Menu Interativo ou Servidor Local
====================================================================
"""

import os
import sys
import json
import time
import base64
import argparse
import tempfile
import urllib.parse
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("[ERRO] Playwright não encontrado. Instale com: pip install playwright")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
SESSION_DIR = BASE_DIR / ".whatsapp_session"


def clean_phone_number(raw_phone: str) -> str:
    """Higieniza o número para o padrão internacional (DDI + DDD + Número)."""
    digits = "".join(filter(str.isdigit, raw_phone or ""))
    if not digits:
        return ""
    # Se não tiver DDI 55 (Brasil) e tiver 10 ou 11 dígitos, adiciona 55
    if len(digits) in (10, 11) and not digits.startswith("55"):
        digits = f"55{digits}"
    return digits


def extract_media_from_package(package_data: dict, temp_dir: str) -> list:
    """Extrai fotos e vídeos em base64 do pacote exportado para arquivos temporários."""
    saved_files = []
    medias = package_data.get("medias", [])
    plate = package_data.get("checklist", {}).get("plateHorse", "TRUCK").upper()

    for idx, m in enumerate(medias, 1):
        b64_str = m.get("base64", "")
        if not b64_str:
            continue

        # Remove cabeçalho 'data:image/jpeg;base64,' se presente
        if "," in b64_str:
            header, b64_str = b64_str.split(",", 1)

        try:
            raw_bytes = base64.b64decode(b64_str)
            ext = ".jpg" if m.get("type") == "photo" else ".mp4"
            clean_name = f"Vistoria_{plate}_midia_{idx}{ext}"
            file_path = os.path.join(temp_dir, clean_name)
            with open(file_path, "wb") as f:
                f.write(raw_bytes)
            saved_files.append(file_path)
        except Exception as e:
            print(f"[AVISO] Falha ao decodificar mídia {idx}: {e}")

    return saved_files


def send_whatsapp_message(
    phone: str,
    text: str,
    media_paths: list = None,
    headless: bool = False,
    timeout_sec: int = 60
) -> bool:
    """
    Abre o WhatsApp Web autenticado, anexa as fotos e envia junto com o relatório.
    """
    phone = clean_phone_number(phone)
    if not phone:
        print("[ERRO] Número de telefone inválido.")
        return False

    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    media_paths = [p for p in (media_paths or []) if os.path.isfile(p)]

    print("----------------------------------------------------------------")
    print(f"[*] Destinatário WhatsApp: +{phone}")
    print(f"[*] Total de fotos/mídias a enviar: {len(media_paths)}")
    print(f"[*] Sessão persistente: {SESSION_DIR}")
    print("----------------------------------------------------------------")

    with sync_playwright() as p:
        print("[*] Iniciando navegador Chromium...")
        # Usa contexto persistente para não pedir QR Code toda vez
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR),
            headless=headless,
            channel="chrome" if os.name == "nt" else None,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized"
            ],
            no_viewport=True
        )

        page = context.new_page()

        # Abre conversa direta pelo link universal
        encoded_text = urllib.parse.quote(text[:950] if media_paths else text)
        url = f"https://web.whatsapp.com/send?phone={phone}&text={encoded_text}"
        print(f"[*] Conectando ao WhatsApp Web...")
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_sec * 1000)

        # Aguarda autenticação ou chat carregar
        print("[*] Aguardando autenticação e carregamento do chat...")
        chat_ready = False
        start_time = time.time()

        while time.time() - start_time < timeout_sec:
            # 1. Verifica se apareceu tela de QR Code (primeira vez)
            if page.locator("canvas[aria-label='Scan me!'], canvas").is_visible():
                print("[!] QR Code detectado na tela! Por favor, aponte a câmera do WhatsApp para conectar...")
                # Dá tempo para escanear
                time.sleep(4)
                continue

            # 2. Verifica se o chat abriu (campo de mensagem ou botão de anexo visível)
            attach_btn = page.locator("button[aria-label*='Anexar'], button[title*='Anexar'], span[data-icon='plus'], span[data-icon='clip']")
            chat_input = page.locator("div[contenteditable='true'][data-tab='10'], footer div[contenteditable='true']")
            
            if attach_btn.is_visible() or chat_input.is_visible():
                chat_ready = True
                break

            # 3. Verifica se número é inválido
            if page.locator("text='O número de telefone compartilhado por url é inválido'").is_visible():
                print("[ERRO] O WhatsApp informou que o número é inválido no WhatsApp.")
                context.close()
                return False

            time.sleep(1)

        if not chat_ready:
            print("[ERRO] Tempo limite esgotado esperando o WhatsApp carregar.")
            context.close()
            return False

        print("[+] Chat carregado com sucesso!")
        time.sleep(2)

        # Se houver fotos/mídias para anexar
        if media_paths:
            print(f"[*] Anexando {len(media_paths)} mídias...")
            try:
                # Clica no botão de anexo se necessário para abrir o input
                attach_btn = page.locator("button[aria-label*='Anexar'], button[title*='Anexar'], span[data-icon='plus'], span[data-icon='clip']").first
                if attach_btn.is_visible():
                    attach_btn.click()
                    time.sleep(1)

                # Localiza input de arquivos
                file_input = page.locator("input[type='file'][accept*='image'], input[type='file']").first
                file_input.set_input_files(media_paths)
                print("[*] Arquivos selecionados no WhatsApp Web!")

                # Aguarda tela de pré-visualização de envio do WhatsApp
                time.sleep(2.5)

                # Digita a legenda no campo de legenda da foto
                caption_input = page.locator("div[aria-label*='legenda'], div[contenteditable='true']").last
                if caption_input.is_visible():
                    caption_input.click()
                    # Preenche legenda (WhatsApp suporta até 1024 caracteres na legenda)
                    caption_text = text[:980]
                    page.keyboard.insert_text(caption_text)
                    print("[+] Legenda com informações do checklist inserida na foto!")
                    time.sleep(1)

                # Clica no botão de enviar da prévia
                send_btn = page.locator("span[data-icon='send'], button[aria-label*='Enviar']").last
                if send_btn.is_visible():
                    send_btn.click()
                else:
                    page.keyboard.press("Enter")

                print("[+] Mídias enviadas com sucesso!")
                time.sleep(4)

                # Se o texto completo era maior que a legenda, envia o restante no chat como complemento
                if len(text) > 980:
                    print("[*] Enviando relatório detalhado completo como mensagem adicional...")
                    chat_input = page.locator("footer div[contenteditable='true']").first
                    if chat_input.is_visible():
                        chat_input.click()
                        page.keyboard.insert_text(text)
                        time.sleep(1)
                        page.keyboard.press("Enter")
                        time.sleep(2)

                print("================================================================")
                print("  [SUCESSO] Fotos e relatório enviados com êxito no WhatsApp!")
                print("================================================================")
                context.close()
                return True

            except Exception as e:
                print(f"[ERRO] Falha ao anexar mídias: {e}")
                # Fallback: envia pelo menos o texto
                page.keyboard.press("Enter")
                time.sleep(2)
                context.close()
                return False

        else:
            # Envio apenas do texto
            print("[*] Enviando mensagem de texto do relatório...")
            page.keyboard.press("Enter")
            time.sleep(3)
            print("================================================================")
            print("  [SUCESSO] Relatório de vistoria enviado com êxito!")
            print("================================================================")
            context.close()
            return True


def find_latest_exported_package() -> str:
    """Busca automaticamente o arquivo JSON de checklist mais recente nas pastas comuns."""
    candidates = []
    search_dirs = [
        BASE_DIR,
        Path.home() / "Downloads",
        Path("c:/Desenvolvimento/Projetos/Check List Rodoviário")
    ]

    for d in search_dirs:
        if d.is_dir():
            for f in d.glob("checklist_python_*.json"):
                candidates.append(f)
            for f in d.glob("*.json"):
                if "checklist" in f.name.lower():
                    candidates.append(f)

    if not candidates:
        return ""

    candidates.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    return str(candidates[0])


def interactive_menu():
    """Menu amigável de console para o motorista ou operador."""
    print("================================================================")
    print("      🚛 ROBÔ PYTHON WHATSAPP - CHECKLIST TRUCK PRO")
    print("================================================================")
    print("  Este utilitário envia as fotos da vistoria JUNTO com")
    print("  as informações completas do checklist diretamente no WhatsApp.")
    print("================================================================\n")

    latest_pkg = find_latest_exported_package()
    pkg_path = ""

    if latest_pkg:
        print(f"[*] Pacote de vistoria recente encontrado:")
        print(f"    -> {latest_pkg}")
        use_recent = input("Deseja usar este arquivo? (S/n): ").strip().lower()
        if use_recent in ("", "s", "sim", "y", "yes"):
            pkg_path = latest_pkg

    if not pkg_path:
        pkg_path = input("Informe o caminho do arquivo .json da vistoria: ").strip().strip('"')

    if not os.path.isfile(pkg_path):
        print(f"[ERRO] Arquivo '{pkg_path}' não encontrado.")
        input("Pressione Enter para sair...")
        return

    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    plate = data.get("checklist", {}).get("plateHorse", "---").upper()
    driver = data.get("checklist", {}).get("driverName", "---")
    medias_count = len(data.get("medias", []))
    caption = data.get("photoCaption") or data.get("reportText", "")

    print("\n--- DADOS DA VISTORIA CARREGADA ---")
    print(f"• Placa do Veículo: {plate}")
    print(f"• Motorista:       {driver}")
    print(f"• Fotos/Vídeos:    {medias_count} anexo(s)")
    print("-----------------------------------\n")

    phone = input("Digite o WhatsApp de destino (Ex: 11999999999 ou 5511999999999): ").strip()
    if not phone:
        print("[ERRO] Telefone obrigatório.")
        input("Pressione Enter para sair...")
        return

    with tempfile.TemporaryDirectory() as tmp_dir:
        extracted_files = extract_media_from_package(data, tmp_dir)
        print(f"[+] {len(extracted_files)} foto(s) extraídas para envio.")

        send_whatsapp_message(
            phone=phone,
            text=caption,
            media_paths=extracted_files,
            headless=False
        )

    input("\nPressione Enter para concluir...")


def main():
    parser = argparse.ArgumentParser(description="Robô Python de Envio de Fotos + Relatório no WhatsApp")
    parser.add_argument("--phone", "-p", help="Número de WhatsApp com DDD (Ex: 5511999999999)")
    parser.add_argument("--checklist", "-c", help="Caminho do arquivo JSON do checklist exportado")
    parser.add_argument("--text", "-t", help="Texto do relatório")
    parser.add_argument("--photos", nargs="*", help="Lista de caminhos de fotos para anexar")
    parser.add_argument("--headless", action="store_true", help="Executa o navegador em modo oculto (após logado)")

    args = parser.parse_args()

    # Se nenhum argumento for passado, abre menu interativo
    if not args.phone and not args.checklist:
        interactive_menu()
        return

    media_paths = args.photos or []
    text_content = args.text or ""

    temp_ctx = None
    if args.checklist and os.path.isfile(args.checklist):
        with open(args.checklist, "r", encoding="utf-8") as f:
            data = json.load(f)
        text_content = data.get("photoCaption") or data.get("reportText") or text_content
        temp_dir = tempfile.mkdtemp()
        extracted = extract_media_from_package(data, temp_dir)
        media_paths.extend(extracted)

    try:
        success = send_whatsapp_message(
            phone=args.phone,
            text=text_content,
            media_paths=media_paths,
            headless=args.headless
        )
        sys.exit(0 if success else 1)
    finally:
        if temp_ctx:
            import shutil
            shutil.rmtree(temp_ctx, ignore_errors=True)


if __name__ == "__main__":
    main()
