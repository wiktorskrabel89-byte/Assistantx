from langchain.tools import tool

notes_storage = []

@tool
def note_tool(content: str) -> str:
    """
    Save a note or retrieve notes from the note storage.
    Use this tool to take notes about important information found during your research.
    """
    notes_storage.append(content)
    return f"Note saved: {content}"
