function savepage_ShadowLoader(maxframedepth)
{
    createShadowDOMs(0,document.documentElement);

    function createShadowDOMs(depth,element)
    {
        var i;

        if (element.localName == "iframe" || element.localName == "frame")
        {
            if (depth < maxframedepth)
            {
                try
                {
                    if (element.contentDocument.documentElement != null)
                    {
                        createShadowDOMs(depth+1,element.contentDocument.documentElement);
                    }
                }
                catch (e) {}
            }
        }
        else
        {
            if (element.children.length >= 1 && element.children[0].localName == "template" && element.children[0].hasAttribute("data-savepage-shadowroot"))
            {
                var shadowRoot = element.shadowRoot || element.attachShadow({ mode: "open" });
                shadowRoot.appendChild(element.children[0].content);
                element.removeChild(element.children[0]);

                for (i = 0; i < element.shadowRoot.children.length; i++)
                    if (element.shadowRoot.children[i] != null)
                       createShadowDOMs(depth,element.shadowRoot.children[i]);
            }

            for (i = 0; i < element.children.length; i++)
                if (element.children[i] != null)
                   createShadowDOMs(depth,element.children[i]);
        }
    }
}
