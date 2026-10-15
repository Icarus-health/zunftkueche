/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "zk_kitchencommit": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "zk_KitchenCommit": {
        "path": "/api/data/v9.2/zk_KitchenCommit",
        "method": "POST",
        "parameters": [
          {
            "name": "RequestJson",
            "in": "body",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "zk_kitchenload": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "zk_KitchenLoad": {
        "path": "/api/data/v9.2/zk_KitchenLoad",
        "method": "POST",
        "parameters": [
          {
            "name": "RequestJson",
            "in": "body",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  }
};
