# Academic PPT task data

Runtime data for the isolated academic-ppt smart tool is stored here.

Expected layout:

```text
tasks/<taskId>/
  uploads/
  outputs/
  task.json
  logs.json
```

The API should only serve files from the matching task directory. Do not store
API keys, provider config, or sensitive headers in these files.
