# Drop SHP source files here (not committed unless small + licensed to share).
#
# Expected per layer (sidecars kept together):
#   <name>.shp + <name>.dbf + <name>.shx + <name>.prj (+ .cpg optional)
# or a single <name>.zip containing those.
#
# Typical Silchester / EH layers:
#   walls / town_walls / defences   -> wall circuit polyline/polygon
#   gates / entrances               -> points
#   roads / streets / thoroughfares -> polylines
#   buildings / houses / insulae    -> polygons with type/period attrs
#   amphitheatre                    -> polygon (ellipse fit)
#   temples / baths / forum / church-> polygons or points (named)
#
# Run:  npm run import:plan -- assets/shp/<your.zip>
#       npm run import:plan -- assets/shp/          (all layers in dir)
#
# Output: src/domain/townPlan.generated.ts (overwrites placeholder).
# townPlan.ts imports GENERATED_* with fallback to the coarse hand values,
# so the game still builds before you run the import.
