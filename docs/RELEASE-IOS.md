# Releasing to TestFlight

What this repository can do on its own, and where a person has to take over.

## Making the build

```bash
scripts/release-ios.sh 2      # the argument is the build number
```

It produces `build/ios/export/App.ipa`, signed with **Apple Distribution: Viktor
Lavrov (742H5JJX37)** — verified by the script, because an archive signed with the
development identity looks identical until App Store Connect rejects it.

Two things it sets that are easy to forget:

- **`ITSAppUsesNonExemptEncryption = false`** in `App/Info.plist`. The app uses
  HTTPS and nothing else, which is exempt; without the key every upload stops to
  ask.
- **The build number must rise every time.** A repeat is rejected after the
  upload, not before, which wastes the round trip.

The widget extension is inside the `.ipa` — six files under `PlugIns/`. Worth
checking after any change to the Xcode project, since a target that silently stops
being embedded still archives cleanly.

## Uploading

Not done here, and not by an agent: it needs an App Store Connect credential, and
this project's fourth principle keeps secrets out of the repository, the bundle and
chat.

Two ways, both the owner's to run:

1. **Transporter** (free, from the Mac App Store). Drag `App.ipa` in, sign in with
   the Apple ID, Deliver. Nothing to configure.
2. **From the command line**, with an App Store Connect API key (App Store Connect
   → Users and Access → Integrations → keys). Put the `.p8` in
   `~/.appstoreconnect/private_keys/` and:

   ```bash
   xcrun altool --upload-app -f build/ios/export/App.ipa -t ios \
     --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
   ```

   The two ids are not secret; the `.p8` is, and stays out of the repository.

## Open testing specifically

A public TestFlight link is not just an upload. In order:

1. **An app record must exist** in App Store Connect for `com.mrwd.filmtable`.
   Created once, by hand.
2. **Upload**, then wait for processing — usually minutes.
3. **Test information** is required before anyone outside the team can be invited:
   what to test, a contact email, and a privacy policy URL.
   <https://film-table.vercel.app/privacy.html> answers 200 and is the one to use.
4. **Beta App Review.** Every build for external testers is reviewed by Apple,
   typically a day or two. Internal testers on the team need no review; the public
   link does.
5. **Enable the public link** on a group under TestFlight → Testers and Groups.
   That is what "open testing" means — anyone with the link can install, up to
   10,000 testers.

## Worth deciding before it is public

The donation button and TMDB's "personal use / no revenue" certification are an
open question in CLAUDE.md. A public beta is the point where that stops being
hypothetical. Not legal advice — but worth a decision rather than a discovery.
