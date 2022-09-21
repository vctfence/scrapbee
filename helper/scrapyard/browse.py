import re
import logging


MARK_SCRIPT = """
<script type="text/javascript" src="/resources/js/jquery.js"></script>
<script type="text/javascript" src="/resources/js/mark.js"></script>
<script type="text/javascript">
    const mark = new Mark(document);

    mark.mark("%%highlight%%", {
        iframes: true,
        acrossElements: true,
        separateWordSearch: false,
        ignorePunctuation: ",-–—‒'\\"+=".split(""),
        done: () => console.log(done)
    });
</script>
"""


# when previewing unpacked archives, since it is impossible to inject scripts from the add-on
# into the cross-origin iframe in the fulltext search page scripts are injected on the server
def highlight_words_in_index(params):
    with open(params["index_file_path"], "r", encoding="utf-8") as index_file:
        mark_script = MARK_SCRIPT.replace("%%highlight%%", params["highlight"])
        content = index_file.read()

        content.replace("</BODY>", "</body>")
        pos = content.rfind("</body>")

        if pos > -1:
            content = content[:pos] + f"{mark_script}</body>" + content[pos + len("</body>"):]

        return content
