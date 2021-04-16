## Automation

Automation is a powerful feature that allows to programmatically create
bookmarks or archives in Scrapyard or browse dedicated bookmarks from
[iShell](https://gchristensen.github.io/ishell/) or your own extensions.

Currently, automation is experimental in Scrapyard, and should be
manually enabled from the automation settings page:
[ext+scrapyard://automation](ext+scrapyard://automation),
which is not displayed at the main UI.

It is implemented through the WebExtensions [runtime messaging API](href="https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage)

The following messages are currently implemented:

#### SCRAPYARD_GET_VERSION

    <p>Returns Scrapyard version. Useful for testing Scrapyard presence in the browser:</p>

<pre data-trimmed="true" class="rainbow-show"><code data-language="javascript" class="rainbow rainbow-show"><span class="keyword">try</span> {
    <span class="storage type">let</span> version <span class="keyword operator">=</span> <span class="keyword">await</span> browser.runtime.<span class="function call">sendMessage</span>(<span class="string">"scrapyard-we@firefox"</span>, {
        type: <span class="string">"SCRAPYARD_GET_VERSION"</span>
    });

    console.<span class="function call">log</span>(<span class="string">`Scrapyard version: ${version}`</span>);
}
<span class="keyword">catch</span> (e) {
    сonsole.<span class="function call">log</span>(<span class="string">"Scrapyard is not installed"</span>);
}</code></pre>

    <h4>SCRAPYARD_ADD_BOOKMARK and SCRAPYARD_ADD_ARCHIVE</h4>
    <p>The following call from your addon will add the page at the active tab as a bookmark or archive to Scrapyard:</p>

<pre data-trimmed="true" class="rainbow-show"><code data-language="javascript" class="rainbow rainbow-show">browser.runtime.<span class="function call">sendMessage</span>(<span class="string">"scrapyard-we@firefox"</span>, {
    type:  <span class="string">"SCRAPYARD_ADD_BOOKMARK"</span>, <span class="comment">// also "SCRAPYARD_ADD_ARCHIVE"</span>
    path:  <span class="string">"shelf/my/directory"</span>, <span class="comment">// optional</span>
    title: <span class="string">"Bookmark Title"</span>, <span class="comment">// optional</span>
    tags:  <span class="string">"comma,separated"</span> <span class="comment">// optional</span>
});</code></pre>

    <h4>SCRAPYARD_BROWSE_UUID</h4>

    <p>This message will open a bookmark defined by the UUID which could be found at its property dialog:</p>

<pre data-trimmed="true" class="rainbow-show"><code data-language="javascript" class="rainbow rainbow-show">browser.runtime.<span class="function call">sendMessage</span>(<span class="string">"scrapyard-we@firefox"</span>, {
    type:  <span class="string">"SCRAPYARD_BROWSE_UUID"</span>,
    uuid:  <span class="string">"F0D858C6ED40416AA402EB2C3257EA17"</span>
});</code></pre>

    <h3>Creating Dedicated iShell Bookmark Commands</h3>

    <p>You can quickly open dedicated bookmarks using iShell commands without using mouse. This may
        be useful in the case of bookmarks with an assigned multi-account container. The example below
        demonstrates a command without arguments used to open a single bookmark defined by its UUID.</p>

<pre data-trimmed="true" class="rainbow-show"><code data-language="javascript" class="rainbow rainbow-show"><span class="comment">/**
    Being placed in the iShell command editor this code
    creates a command named "my-twitter", which opens
    a single bookmark defined by its UUID.

    @description Opens my twitter account in a personal container
    @command
*/</span>
<span class="storage type class">class</span> <span class="entity name class">MyTwitter</span> {
    <span class="entity name function">execute</span>() {
        browser.runtime.<span class="function call">sendMessage</span>(<span class="string">"scrapyard-we@firefox"</span>, {
            type: <span class="string">"SCRAPYARD_BROWSE_UUID"</span>,
            uuid: <span class="string">"F0D858C6ED40416AA402EB2C3257EA17"</span>
        });
    }
}</code></pre>


    <p>You can create more complex commands with arguments corresponding to the bookmarks you want to open.
        The following example creates a command named <b>my-site</b> which can be called with either
        <i>personal</i> or <i>work</i> argument.
    </p>

<pre data-trimmed="true" class="rainbow-show"><code data-language="javascript" class="rainbow rainbow-show"><span class="comment">/**
    This command (my-site) has arguments that allow to open
    a site in a work or a personal context. The corresponding
    containers should be assigned to the bookmarks in Scrapyard.

    @command
    @description Opens my site in different contexts
*/</span>
<span class="storage type class">class</span> <span class="entity name class">MySite</span> {
    <span class="entity name function">constructor</span>(args) {
        <span class="storage type">const</span> sites <span class="keyword operator">=</span> {<span class="string">"personal"</span>: <span class="string">"589421A3D93941B4BAD4A2DEE8FF5297"</span>,
                       <span class="string">"work"</span>:     <span class="string">"6C53355203D94BC59996E21D15C86C3E"</span>};
        args[OBJECT] <span class="keyword operator">=</span> {nountype: sites, label: <span class="string">"site"</span>};
    }

    <span class="entity name function">preview</span>({OBJECT}, display) {
        display.<span class="function call">text</span>(<span class="string">"Opens my site in "</span> <span class="keyword operator">+</span> OBJECT?.text <span class="keyword operator">+</span> <span class="string">" context."</span>);
    }

    <span class="entity name function">execute</span>({OBJECT}) {
        browser.runtime.<span class="function call">sendMessage</span>(<span class="string">"scrapyard-we@firefox"</span>, {
            type: <span class="string">"SCRAPYARD_BROWSE_UUID"</span>,
            uuid: OBJECT?.data
        });
    }
}</code></pre>
