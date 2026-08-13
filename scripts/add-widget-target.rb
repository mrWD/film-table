# Adds the WidgetKit extension target to the Capacitor-generated Xcode project.
#
# Capacitor regenerates very little of `ios/`, but the project file is still the kind of
# thing that gets recreated by hand or by a future `cap` command, so this exists as a
# script rather than as a one-off edit: run it again and it repairs the project instead
# of duplicating the target.
#
#   gem install --user-install xcodeproj
#   ruby scripts/add-widget-target.rb

require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT = File.join(ROOT, 'ios/App/App.xcodeproj')
WIDGET = 'FilmTableWidget'
APP_GROUP = 'group.com.mrwd.filmtable'
BUNDLE_ID = 'com.mrwd.filmtable'
TEAM = '742H5JJX37'

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == 'App' } or abort 'App target not found'

# The bridge is a plugin inside the app, not part of the extension, and it has to be in
# the app target's sources or Capacitor never sees it. Compiled out, everything else
# still builds and the widget simply stays empty forever — so this runs on every
# invocation, including the early exit below.
app_group_node = project.main_group['App'] || project.main_group

# The reference is added inside the `App` group, which already carries `App/` in its own
# path — so the name here is bare. Spelling it `App/WidgetBridge.swift` produces
# `App/App/WidgetBridge.swift` and a build that cannot find its own input.
%w[WidgetBridge.swift MainViewController.swift].each do |name|
  next if app.source_build_phase.files_references.any? { |f| f.path == name }
  ref = app_group_node.files.find { |f| f.path == name } || app_group_node.new_reference(name)
  app.add_file_references([ref])
  puts "added #{name} to the App target"
end
project.save

existing = app_group_node.files.select { |f| f.path&.end_with?('WidgetBridge.swift') }
wrong = existing.reject { |f| f.path == 'WidgetBridge.swift' }
wrong.each do |ref|
  app.source_build_phase.remove_file_reference(ref)
  ref.remove_from_project
end
puts "removed #{wrong.size} mis-pathed reference(s)" unless wrong.empty?

unless app.source_build_phase.files_references.any? { |f| f.path == 'WidgetBridge.swift' }
  ref = app_group_node.files.find { |f| f.path == 'WidgetBridge.swift' } ||
        app_group_node.new_reference('WidgetBridge.swift')
  app.add_file_references([ref])
  project.save
  puts 'added WidgetBridge.swift to the App target'
end

if project.targets.any? { |t| t.name == WIDGET }
  puts "#{WIDGET} target already present — nothing else to add"
  exit
end

# ---- entitlements -----------------------------------------------------------------
# Both sides need the same App Group; without it the widget reads an empty container
# and silently shows nothing, which is the least debuggable failure of the whole
# feature.
def write_entitlements(path, group)
  File.write(path, <<~XML)
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>com.apple.security.application-groups</key>
      <array>
        <string>#{group}</string>
      </array>
    </dict>
    </plist>
  XML
end

write_entitlements(File.join(ROOT, 'ios/App/App/App.entitlements'), APP_GROUP)
write_entitlements(File.join(ROOT, "ios/App/#{WIDGET}/#{WIDGET}.entitlements"), APP_GROUP)

info_plist = File.join(ROOT, "ios/App/#{WIDGET}/Info.plist")
File.write(info_plist, <<~XML)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>NSExtension</key>
    <dict>
      <key>NSExtensionPointIdentifier</key>
      <string>com.apple.widgetkit-extension</string>
    </dict>
  </dict>
  </plist>
XML

# ---- the target -------------------------------------------------------------------
widget = project.new_target(:app_extension, WIDGET, :ios, '17.0')
group = project.new_group(WIDGET, "#{WIDGET}")

%w[Snapshot.swift FilmTableWidget.swift].each do |name|
  ref = group.new_reference(name)
  widget.add_file_references([ref])
end

widget.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.widget"
  s['PRODUCT_NAME'] = WIDGET
  s['INFOPLIST_FILE'] = "#{WIDGET}/Info.plist"
  s['CODE_SIGN_ENTITLEMENTS'] = "#{WIDGET}/#{WIDGET}.entitlements"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = TEAM
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
end

# The app target has to carry the entitlement too, and embed the extension: an
# extension that is built but not embedded produces a perfectly green build and no
# widget in the picker.
app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  # Without a team in the project itself, Xcode's Signing & Capabilities editor refuses
  # to load the capability list at all — "No development team is set", and App Groups
  # cannot even be searched for. Passing the team on the xcodebuild command line is not
  # enough, because the GUI never sees it.
  config.build_settings['DEVELOPMENT_TEAM'] = TEAM
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
end

app.add_dependency(widget)
embed = app.build_phases.find { |p| p.respond_to?(:name) && p.name == 'Embed App Extensions' }
embed ||= project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase).tap do |phase|
  phase.name = 'Embed App Extensions'
  phase.symbol_dst_subfolder_spec = :plug_ins
  app.build_phases << phase
end
embed.add_file_reference(widget.product_reference, true)

# WidgetKit and SwiftUI are implicit in modern Xcode, but the entitlements file has to
# be visible in the app group for signing to pick it up.
app_group = project.main_group['App'] || project.main_group
app_group.new_reference('App/App.entitlements') unless app_group.files.any? { |f| f.path&.end_with?('App.entitlements') }

project.save
puts "added #{WIDGET} target, App Group #{APP_GROUP}"
