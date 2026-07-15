import plistlib
import uuid

BASE = "https://www.baidu.com/s?wd="
assert len(BASE) == 27, len(BASE)
PLACEHOLDER = "查询"   # 占位文本，运行时被变量替换
assert len(PLACEHOLDER) == 2

uid_ask = str(uuid.uuid4())
uid_url = str(uuid.uuid4())
uid_open = str(uuid.uuid4())

ask = {
    "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
    "UUID": uid_ask,
    "WFWorkflowActionParameters": {
        "WFAskActionPrompt": "要搜索什么？",
        "WFInputType": "Text",
    },
}

url = {
    "WFWorkflowActionIdentifier": "is.workflow.actions.url",
    "UUID": uid_url,
    "WFWorkflowActionParameters": {
        "WFURLActionURL": {
            "WFSerializationType": "WFTextTokenString",
            "Value": {
                "string": BASE + PLACEHOLDER,
                "attachmentsByRange": {
                    "{27, 2}": {
                        "Type": "Variable",
                        "VariableName": uid_ask,
                        "OutputName": PLACEHOLDER,
                    }
                },
            },
        }
    },
}

open_url = {
    "WFWorkflowActionIdentifier": "is.workflow.actions.openurl",
    "UUID": uid_open,
    "WFWorkflowActionParameters": {
        "WFURL": {
            "WFSerializationType": "WFTextTokenAttachment",
            "Value": {
                "Type": "Variable",
                "VariableName": uid_url,
                "OutputName": "URL",
            },
        }
    },
}

workflow = {
    "WFWorkflowName": "悟空搜索",
    "WFWorkflowTypes": ["ActionApp", "NCWidget", "WatchKit", "Siri", "Sharing", "Wizard"],
    "WFWorkflowClientRelease": "7.0",
    "WFWorkflowClientVersion": "900",
    "WFWorkflowImportQuestions": [],
    "WFWorkflowActions": [ask, url, open_url],
    "WFWorkflowIcon": {
        "WFWorkflowIconGlyphNumber": 59511,
        "WFWorkflowIconImageData": b"",
        "WFWorkflowIconStartColor": 4270985469,
    },
}

with open("/Users/chenying/anime-coze/wukong-search.shortcut", "wb") as f:
    f.write(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))

# 验证：读回确认是合法 plist
with open("/Users/chenying/anime-coze/wukong-search.shortcut", "rb") as f:
    back = plistlib.load(f)
print("OK actions:", len(back["WFWorkflowActions"]))
print("name:", back["WFWorkflowName"])
print("ask uuid:", back["WFWorkflowActions"][0]["UUID"])
print("var ref in url:", back["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFURLActionURL"]["Value"]["attachmentsByRange"])
