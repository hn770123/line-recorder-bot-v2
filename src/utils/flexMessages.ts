export const createPollFlexMessage = (originalPostId: string, baseUrl: string) => {
  const resultsUrl = `${baseUrl}/poll/${originalPostId}`;

  return {
    "type": "flex",
    "altText": "アンケート",
    "contents": {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "Select one. Can be changed.",
            "weight": "bold",
            "size": "sm"
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "spacing": "sm",
            "contents": [
              {
                "type": "button",
                "style": "primary",
                "height": "sm",
                "action": {
                  "type": "postback",
                  "label": "OK",
                  "data": `action=answer&value=OK&postId=${originalPostId}`
                }
              },
              {
                "type": "button",
                "style": "secondary",
                "height": "sm",
                "action": {
                  "type": "postback",
                  "label": "NG",
                  "data": `action=answer&value=NG&postId=${originalPostId}`
                }
              },
              {
                "type": "button",
                "style": "secondary",
                "height": "sm",
                "action": {
                  "type": "postback",
                  "label": "N/A",
                  "data": `action=answer&value=N/A&postId=${originalPostId}`
                }
              }
            ]
          },
          {
            "type": "separator",
            "margin": "sm"
          },
          {
            "type": "button",
            "style": "link",
            "height": "sm",
            "action": {
              "type": "uri",
              "label": "See results",
              "uri": resultsUrl
            }
          }
        ],
        "flex": 0
      }
    }
  };
};
