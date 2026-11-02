"""The Claude model LabMind calls, and what every call site needs to talk to it."""
import os

# claude-sonnet-4-20250514 has been retired; Claude Sonnet 5.5 is the same tier. Override with LABMIND_MODEL.
MODEL = os.environ.get("LABMIND_MODEL", "claude-sonnet-5-5")

# The original model ran without extended thinking. On Sonnet 5.5 the thinking-off setting is "between_tools";
# every other model rejects that value, so with any other model the field is left out (adaptive thinking).
THINKING = {"type": "between_tools"} if MODEL == "claude-sonnet-5-5" else None
THINKING_KWARGS = {"thinking": THINKING} if THINKING else {}


def first_text(message) -> str:
    """The response's text. Thinking blocks can come before it, so content[0] is not always text."""
    if message.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined the request ({getattr(message, 'stop_details', None)})")
    return "".join(block.text for block in message.content if block.type == "text").strip()
