package l2.albitron.scrapyard;

import android.content.Intent;
import android.net.Uri;
import android.support.v4.app.ActivityCompat;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;

import l2.albitron.scrapyard.cloud.CloudBackend;
import l2.albitron.scrapyard.cloud.CloudOperationsService;

public class TODODialogActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_tododialog);

        this.setFinishOnTouchOutside(false);

        Button btnCancel = findViewById(R.id.btnCancel);
        btnCancel.setOnClickListener(v -> this.finish());

        Button btnOK = findViewById(R.id.btnOk);
        btnOK.setOnClickListener(v -> this.proceed());

    }

    protected void proceed() {
        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            Uri referrerUri = ActivityCompat.getReferrer(this);
            String referrer = referrerUri != null? referrerUri.getHost(): "";
            Bundle extras = intent.getExtras();

            if (extras != null) {
                Spinner todoState = findViewById(R.id.todoState);
                String state = todoState.getSelectedItem().toString();
                extras.putString(CloudBackend.EXTRA_TODO_STATE, state);

                EditText todoDetails = findViewById(R.id.todoDetails);
                extras.putString(CloudBackend.EXTRA_TODO_DETAILS, todoDetails.getText().toString());

                CloudOperationsService.startCloudSharing(this, referrer, null, extras);
                finish();
            }

        }
    }
}
