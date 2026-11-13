from services.cleaner import release_vram


def release_vram_endpoint():
    try:
        release_vram()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
