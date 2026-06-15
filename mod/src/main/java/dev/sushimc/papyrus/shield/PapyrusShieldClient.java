package dev.sushimc.papyrus.shield;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

public final class PapyrusShieldClient implements ClientModInitializer {

    public static final Identifier CHANNEL = Identifier.of("papyrus", "integrity");
    private static final Gson GSON = new Gson();

    @Override
    public void onInitializeClient() {
        PayloadTypeRegistry.playS2C().register(IntegrityPayload.ID, IntegrityPayload.CODEC);
        PayloadTypeRegistry.playC2S().register(IntegrityPayload.ID, IntegrityPayload.CODEC);

        ClientPlayNetworking.registerGlobalReceiver(IntegrityPayload.ID, (payload, context) -> {
            final JsonObject root = GSON.fromJson(payload.json(), JsonObject.class);
            if (root != null && root.has("action") && "request".equals(root.get("action").getAsString())) {
                context.client().execute(() -> sendReport(context.player().networkHandler));
            }
        });

        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> sendReport(handler));
    }

    private static void sendReport(final net.minecraft.client.network.ClientPlayNetworkHandler handler) {
        if (!ClientPlayNetworking.canSend(IntegrityPayload.ID)) {
            return;
        }
        ClientPlayNetworking.send(new IntegrityPayload(buildReportJson()));
    }

    static String buildReportJson() {
        final JsonObject root = new JsonObject();
        root.addProperty("v", 1);
        root.addProperty("client", "papyrus-client");
        root.addProperty("shield", PapyrusShieldClient.class.getPackage().getImplementationVersion() != null
            ? PapyrusShieldClient.class.getPackage().getImplementationVersion()
            : "dev");

        final JsonArray mods = new JsonArray();
        final List<String> modIds = new ArrayList<>();
        FabricLoader.getInstance().getAllMods().forEach(mod -> {
            final String id = mod.getMetadata().getId();
            modIds.add(id);
            mods.add(id + "@" + mod.getMetadata().getVersion().getFriendlyString());
        });
        root.add("mods", mods);
        root.addProperty("count", modIds.size());
        return GSON.toJson(root);
    }

    public record IntegrityPayload(String json) implements CustomPayload {
        public static final CustomPayload.Id<IntegrityPayload> ID = new CustomPayload.Id<>(CHANNEL);
        public static final PacketCodec<PacketByteBuf, IntegrityPayload> CODEC = PacketCodec.of(
            (payload, buf) -> {
                final byte[] bytes = payload.json().getBytes(StandardCharsets.UTF_8);
                buf.writeVarInt(bytes.length);
                buf.writeBytes(bytes);
            },
            buf -> {
                final byte[] bytes = new byte[buf.readVarInt()];
                buf.readBytes(bytes);
                return new IntegrityPayload(new String(bytes, StandardCharsets.UTF_8));
            }
        );

        @Override
        public Id<? extends CustomPayload> getId() {
            return ID;
        }
    }
}
