package dev.sushimc.papyrus.shield;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

public final class PapyrusShieldClient implements ClientModInitializer {

    public static final Identifier CHANNEL = Identifier.fromNamespaceAndPath("papyrus", "integrity");
    private static final Gson GSON = new Gson();
    private static final int MAX_REPORT_BYTES = 65536;

    @Override
    public void onInitializeClient() {
        PayloadTypeRegistry.clientboundPlay().register(IntegrityPayload.TYPE, IntegrityPayload.CODEC);
        PayloadTypeRegistry.serverboundPlay().register(IntegrityPayload.TYPE, IntegrityPayload.CODEC);

        ClientPlayNetworking.registerGlobalReceiver(IntegrityPayload.TYPE, (payload, context) -> {
            final JsonObject root = GSON.fromJson(payload.json(), JsonObject.class);
            if (root != null && root.has("action") && "request".equals(root.get("action").getAsString())) {
                context.client().execute(PapyrusShieldClient::sendReport);
            }
        });

        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> sendReport());
    }

    private static void sendReport() {
        if (!ClientPlayNetworking.canSend(IntegrityPayload.TYPE)) {
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

    public record IntegrityPayload(String json) implements CustomPacketPayload {
        public static final CustomPacketPayload.Type<IntegrityPayload> TYPE =
            new CustomPacketPayload.Type<>(CHANNEL);
        public static final StreamCodec<RegistryFriendlyByteBuf, IntegrityPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.stringUtf8(MAX_REPORT_BYTES),
            IntegrityPayload::json,
            IntegrityPayload::new
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }
}
