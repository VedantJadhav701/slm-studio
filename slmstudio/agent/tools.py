"""Typed and narrow suggest-only tool definitions for SLM Studio agents."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ToolParameter:
    name: str
    type: str  # "string", "number", "boolean", "enum"
    description: str
    required: bool = True
    enum_values: Optional[List[str]] = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: List[ToolParameter]
    requires_approval: bool = True

    def to_schema(self) -> Dict[str, Any]:
        properties = {}
        required = []
        for p in self.parameters:
            prop: Dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum_values:
                prop["enum"] = p.enum_values
            properties[p.name] = prop
            if p.required:
                required.append(p.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }


# Allowlisted Suggest-Only Tools
TOOLS: Dict[str, ToolDefinition] = {
    "create_ticket": ToolDefinition(
        name="create_ticket",
        description="Creates an IT support or customer issue ticket.",
        parameters=[
            ToolParameter("category", "string", "Ticket category", enum_values=["it", "billing", "security", "hr"]),
            ToolParameter("priority", "string", "Severity priority", enum_values=["low", "medium", "high", "urgent"]),
            ToolParameter("summary", "string", "Clear summary title of the issue"),
            ToolParameter("description", "string", "Detailed description and steps"),
        ],
        requires_approval=True,
    ),
    "search_knowledge": ToolDefinition(
        name="search_knowledge",
        description="Searches local company documentation and policy chunks.",
        parameters=[
            ToolParameter("query", "string", "Keywords or natural language search query"),
            ToolParameter("top_k", "number", "Maximum number of results to retrieve", required=False),
        ],
        requires_approval=False,
    ),
    "suggest_command": ToolDefinition(
        name="suggest_command",
        description="Proposes a safe, allowlisted maintenance command for administrator review.",
        parameters=[
            ToolParameter("template_id", "string", "Allowlisted command template", enum_values=["docker_ps", "git_status", "disk_usage", "service_restart"]),
            ToolParameter("target_name", "string", "Target service or directory identifier"),
        ],
        requires_approval=True,
    ),
}


def get_all_tool_schemas() -> List[Dict[str, Any]]:
    return [t.to_schema() for t in TOOLS.values()]
