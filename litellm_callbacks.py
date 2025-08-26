# litellm_callbacks.py
import litellm
import json

# Logica de "curățare" a schemei, tradusă în Python
def simplify_schema_node(node):
    if not isinstance(node, dict):
        return node

    # Problema principală: aplatizarea structurii "value"
    if "value" in node and isinstance(node["value"], dict) and "type" in node["value"]:
        return simplify_schema_node(node["value"])

    # Corecția pentru 'type' ca array
    if "type" in node and isinstance(node["type"], list):
        non_null_type = next((t for t in node["type"] if t != "null"), "string")
        node["type"] = non_null_type

    # Parcurgem recursiv sub-proprietățile
    new_node = {}
    for key, value in node.items():
        new_node[key] = simplify_schema_node(value)
    
    return new_node

# Funcție callback pentru interceptarea și corectarea request-urilor
def gemini_tool_fixer(
    kwargs,  # argumentele cererii
    completion_response=None,  # răspunsul (None pentru pre_call)
    start_time=None,  # timpul de început
    end_time=None  # timpul de sfârșit
):
    """
    Callback universal pentru corectarea schemei de tools înainte de trimitere la Gemini
    Funcționează cu signature-ul complet de LiteLLM callback.
    """
    print(f"\n✅ [LiteLLM Callback] S-a interceptat o cerere. Se verifică schema de unelte...")
    print(f"    - kwargs keys: {list(kwargs.keys())[:10]}...")  # primele 10 chei pentru debugging
    
    # Verificăm dacă este un pre-call event (când start_time nu este None și completion_response este None)
    is_pre_call = completion_response is None
    
    if not is_pre_call:
        print("    - Nu este pre-call event, se ignoră")
        return kwargs
        
    tools_found = False
    
    # Căutăm tools în mai multe locuri
    # 1. Direct în kwargs
    tools = kwargs.get("tools")
    if tools and isinstance(tools, list):
        print(f"    - S-au detectat {len(tools)} unelte în kwargs.tools")
        tools_found = True
        fix_tools_schema(tools)
    
    # 2. În additional_args['complete_input_dict']
    additional_args = kwargs.get("additional_args", {})
    complete_input_dict = additional_args.get("complete_input_dict", {})
    if "tools" in complete_input_dict and complete_input_dict["tools"]:
        tools = complete_input_dict["tools"]
        if isinstance(tools, list) and len(tools) > 0:
            print(f"    - S-au detectat {len(tools)} unelte în complete_input_dict.tools")
            tools_found = True
            fix_tools_schema(tools)
    
    # 3. În messages pentru tool calls
    messages = kwargs.get("messages", [])
    for message in messages:
        if isinstance(message, dict) and message.get("role") == "system":
            content = message.get("content")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "tools" in item:
                        tools = item["tools"]
                        if isinstance(tools, list) and len(tools) > 0:
                            print(f"    - S-au detectat {len(tools)} unelte în system message")
                            tools_found = True
                            fix_tools_schema(tools)
    
    if not tools_found:
        print("    - Nu s-au găsit unelte în cerere.")
        # Debug minimal pentru a nu spam logurile
        if len(kwargs) < 50:  # afișează doar pentru request-uri mici
            print(f"    - Chei disponibile: {list(kwargs.keys())}")
    
    return kwargs

def fix_tools_schema(tools):
    """
    Aplică corecția de schemă pentru o listă de tools
    """
    for i, tool in enumerate(tools):
        if isinstance(tool, dict) and "function" in tool and "parameters" in tool["function"]:
            original_params = tool["function"]["parameters"]
            print(f"    - Procesez unealta {tool['function'].get('name', 'unknown')}")
            
            # Aplicăm funcția noastră de curățare
            cleaned_params = simplify_schema_node(original_params)
            tool["function"]["parameters"] = cleaned_params
            print(f"    - Unealta {i+1} ({tool['function'].get('name', 'unknown')}) - schemă corectată")
    
    print("    - Schema de unelte a fost curățată cu succes.")