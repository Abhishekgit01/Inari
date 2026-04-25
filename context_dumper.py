import os

PROJECT_ROOT = "/Abhi/Projects/HACKMALANADU"
OUT_FILE = "/Abhi/Projects/HACKMALANADU/codebase_context_full.md"

def generate_dump():
    with open(OUT_FILE, "w", encoding="utf-8") as out:
        out.write("# Complete Codebase Context\n\n")
        
        directories_to_scan = [
            os.path.join(PROJECT_ROOT, "backend/src"),
            os.path.join(PROJECT_ROOT, "src")
        ]
        
        for dir_path in directories_to_scan:
            for root, dirs, files in os.walk(dir_path):
                # skip some dirs like pycache just in case
                dirs[:] = [d for d in dirs if d not in ("__pycache__", "node_modules", "dist", ".git")]
                for file in files:
                    if file.endswith((".py", ".ts", ".tsx", ".css", ".json")):
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, PROJECT_ROOT)
                        ext = rel_path.split('.')[-1]
                        lang = "python" if ext == "py" else ("typescript" if ext == "ts" else "tsx")
                        
                        out.write(f"## File: `{rel_path}`\n\n")
                        out.write(f"```{lang}\n")
                        try:
                            with open(abs_path, "r", encoding="utf-8") as src:
                                out.write(src.read())
                        except Exception as e:
                            out.write(f"Error reading {rel_path}: {e}")
                        out.write("\n```\n\n")

if __name__ == "__main__":
    generate_dump()
