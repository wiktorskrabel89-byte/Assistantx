from langchain.tools import tool

notes_storage = []

@tool
def note_tool(content: str) -> str:
    """
    Save a note or retrieve notes from the note storage.
    Use this tool to take notes about important information found during your research.
    """
    notes_storage.append(content)
    # Enforce a memory limit of 20 notes (keep only the 20 most recent)
    if len(notes_storage) > 20:
        del notes_storage[:-20]
    return f"Note saved: {content}"
